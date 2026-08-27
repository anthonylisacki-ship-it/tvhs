const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs-extra");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const VENMO_USERNAME = "vastprinting";

// Venmo payment is ALWAYS $22
const SHIRT_PRICE = 22;

// Store CSV under ./data
const DATA_DIR = path.join(__dirname, "data");
fs.ensureDirSync(DATA_DIR);

const CSV_FILE = path.join(DATA_DIR, "orders.csv");

// -------------------- EMAIL --------------------
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER, // vastprintingaz@gmail.com
    pass: process.env.EMAIL_PASS
  }
});

// -------------------- CSV INIT --------------------
if (!fs.existsSync(CSV_FILE)) {
  const headers = [
    "Timestamp",
    "Player Name",
    "Email",
    "Shirt Size",
    "Number of Player Lines",
    ...Array.from({ length: 20 }, (_, i) => `Player Line ${i + 1}`),
    "Business Design Purchased",
    "Number of Business Lines",
    ...Array.from({ length: 10 }, (_, i) => `Business Line ${i + 1}`),
    "Shirt Payment"
  ];

  fs.writeFileSync(CSV_FILE, headers.join(",") + "\n");
}

// -------------------- SUBMIT --------------------
app.post("/submit", async (req, res) => {
  try {
    const data = req.body;

    if (!data.terms) {
      return res.status(400).json({
        error: "Terms not accepted"
      });
    }

    // Number of supporter lines submitted
    const playerLinesCount =
      parseInt(data.lineCount, 10) || 0;

    // Number of business lines submitted
    const businessLinesCount =
      data.businessDesign === "yes"
        ? parseInt(data.businessLines, 10) || 0
        : 0;

    // --------------------------------------------------
    // VENMO PAYMENT
    // ALWAYS $22 REGARDLESS OF NUMBER OF LINES SELECTED
    // --------------------------------------------------
    const totalAmount = SHIRT_PRICE;

    // -------------------- SUPPORTER LINES --------------------
    const playerLines = [];

    for (let i = 1; i <= playerLinesCount; i++) {
      playerLines.push(data[`line${i}`] || "");
    }

    // -------------------- BUSINESS LINES --------------------
    const businessLines = [];

    if (data.businessDesign === "yes") {
      for (let i = 1; i <= businessLinesCount; i++) {
        businessLines.push(
          data[`businessLine${i}`] || ""
        );
      }
    }

    const timestamp = new Date().toISOString();

    // -------------------- CSV ROW --------------------
    const csvRow = [
      timestamp,
      data.playerName,
      data.email,
      data.shirtSize,
      playerLinesCount,

      ...Array.from(
        { length: 20 },
        (_, i) => playerLines[i] || ""
      ),

      data.businessDesign || "No",
      businessLinesCount,

      ...Array.from(
        { length: 10 },
        (_, i) => businessLines[i] || ""
      ),

      totalAmount
    ]
      .map(
        v =>
          `"${String(v ?? "").replace(/"/g, '""')}"`
      )
      .join(",") + "\n";

    await fs.appendFile(CSV_FILE, csvRow);

    // -------------------- VENMO LINK --------------------
    const note = encodeURIComponent(
      `Desert Thunder Softball Supporter Shirt - ${data.playerName}`
    );

    const venmoLink =
      `https://venmo.com/?txn=pay` +
      `&recipients=${VENMO_USERNAME}` +
      `&amount=${SHIRT_PRICE}` +
      `&note=${note}`;

    // -------------------- SUPPORTER TEXT --------------------
    const supporterLinesText =
      playerLinesCount > 0
        ? playerLines
            .map(
              (name, idx) =>
                `  ${idx + 1}. ${name}`
            )
            .join("\n")
        : "  (none)";

    // -------------------- BUSINESS TEXT --------------------
    const businessLinesText =
      businessLinesCount > 0
        ? businessLines
            .map(
              (name, idx) =>
                `  ${idx + 1}. ${name}`
            )
            .join("\n")
        : "  (none)";

    // -------------------- ADMIN EMAIL --------------------
    const adminEmailText = `New Desert Thunder Softball Supporter Shirt Order

Date/Time: ${timestamp}

Athlete Name: ${data.playerName}
Customer Email: ${data.email}
Shirt Size: ${data.shirtSize}

Supporter Lines Submitted: ${playerLinesCount}
Supporter Names:
${supporterLinesText}

Business Sponsorship Selected: ${data.businessDesign || "No"}
Business Lines Submitted: ${businessLinesCount}
Business Names:
${businessLinesText}

Shirt Production Payment: $${SHIRT_PRICE}

IMPORTANT:
The fundraising money collected from supporters is NOT included in this payment.

All fundraising money should be submitted directly to the athlete's team representative.

The $${SHIRT_PRICE} Venmo payment is only for production of the supporter shirt.

If the Venmo payment was not completed at checkout, use this link:

${venmoLink}
`;

    // -------------------- CUSTOMER EMAIL --------------------
    const customerEmailText = `Thank you for supporting Desert Thunder Softball!

Desert Thunder Softball Supporter Shirt Submission
--------------------------------------------------

Athlete Name: ${data.playerName}
Email: ${data.email}
Shirt Size: ${data.shirtSize}

Supporter Lines Submitted: ${playerLinesCount}
Supporter Names:
${supporterLinesText}

Business Sponsorship Selected: ${data.businessDesign || "No"}
Business Lines Submitted: ${businessLinesCount}
Business Names:
${businessLinesText}

Shirt Production Payment: $${SHIRT_PRICE}
--------------------------------------------------

Please remember:

All fundraising money collected should be submitted directly to your team representative.

The $${SHIRT_PRICE} Venmo payment is separate from the fundraising money and is only for production of the supporter shirt.

If you did not complete your Venmo payment at checkout, please use this link:

${venmoLink}
`;

    // -------------------- SEND ADMIN EMAIL --------------------
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: `New Desert Thunder Softball Shirt Order - ${data.playerName}`,
      text: adminEmailText
    });

    // -------------------- SEND CUSTOMER EMAIL --------------------
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: data.email,
      subject: "Desert Thunder Softball Supporter Shirt Confirmation",
      text: customerEmailText
    });

    // -------------------- RESPONSE --------------------
    return res.json({
      venmoLink,
      amount: SHIRT_PRICE,
      totalAmount: SHIRT_PRICE
    });

  } catch (err) {
    console.error("SUBMIT ERROR:", err);

    return res.status(500).json({
      error: "Server error"
    });
  }
});

// -------------------- CSV DOWNLOAD --------------------
app.get("/admin/orders.csv", (req, res) => {
  res.download(CSV_FILE, "orders.csv");
});

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open: http://localhost:${PORT}`);
  console.log(`CSV: http://localhost:${PORT}/admin/orders.csv`);
});
