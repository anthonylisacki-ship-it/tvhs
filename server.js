const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs-extra");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const VENMO_USERNAME = "GoCats25";
const PRICE_PER_PLAYER_LINE = 20;
const PRICE_PER_BUSINESS_LINE = 200;

// store CSV under ./data (cleaner)
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
    pass: process.env.EMAIL_PASS  // yaud ainy qarq piut
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
    "Total Amount"
  ];
  fs.writeFileSync(CSV_FILE, headers.join(",") + "\n");
}

// -------------------- SUBMIT --------------------
app.post("/submit", async (req, res) => {
  try {
    const data = req.body;

    if (!data.terms) {
      return res.status(400).json({ error: "Terms not accepted" });
    }

    const playerLinesCount = parseInt(data.lineCount) || 0;
    const businessLinesCount =
      data.businessDesign === "yes" ? parseInt(data.businessLines) || 0 : 0;

    const totalAmount =
      playerLinesCount * PRICE_PER_PLAYER_LINE +
      businessLinesCount * PRICE_PER_BUSINESS_LINE;

    // supporter lines
    const playerLines = [];
    for (let i = 1; i <= playerLinesCount; i++) {
      playerLines.push(data[`line${i}`] || "");
    }

    // business lines
    const businessLines = [];
    if (data.businessDesign === "yes") {
      for (let i = 1; i <= businessLinesCount; i++) {
        businessLines.push(data[`businessLine${i}`] || "");
      }
    }

    const timestamp = new Date().toISOString();

    // CSV row (escape quotes)
    const csvRow = [
      timestamp,
      data.playerName,
      data.email,
      data.shirtSize,
      playerLinesCount,
      ...Array.from({ length: 20 }, (_, i) => playerLines[i] || ""),
      data.businessDesign || "No",
      businessLinesCount,
      ...Array.from({ length: 10 }, (_, i) => businessLines[i] || ""),
      totalAmount
    ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",") + "\n";

    await fs.appendFile(CSV_FILE, csvRow);

    // Venmo link
    const note = encodeURIComponent(`Who Has My Back Fundraiser - ${data.playerName}`);
    const venmoLink =
      `https://venmo.com/?txn=pay&recipients=${VENMO_USERNAME}&amount=${totalAmount}&note=${note}`;

    // Build detailed text
    const supporterLinesText = playerLinesCount
      ? playerLines.map((name, idx) => `  ${idx + 1}. ${name}`).join("\n")
      : "  (none)";

    const businessLinesText = businessLinesCount
      ? businessLines.map((name, idx) => `  ${idx + 1}. ${name}`).join("\n")
      : "  (none)";

    const adminEmailText = `New Shirt Order — 14U Wildcats Cheer

Date/Time: ${timestamp}

Athlete Name: ${data.playerName}
Customer Email: ${data.email}
Shirt Size: ${data.shirtSize}

Supporter Lines Purchased: ${playerLinesCount}
Supporter Names:
${supporterLinesText}

Business Design Purchased: ${data.businessDesign || "No"}
Business Lines Purchased: ${businessLinesCount}
Business Names:
${businessLinesText}

Total Amount: $${totalAmount}

If you did not process your Venmo payment at checkout, please click here to finish payment:
${venmoLink}
`;

    const customerEmailText = `Thank you for your order!

Wildcats Cheer Order Summary
-----------------------
Athlete Name: ${data.playerName}
Email: ${data.email}
Shirt Size: ${data.shirtSize}

Supporter Lines Purchased: ${playerLinesCount}
Supporter Names:
${supporterLinesText}

Business Design Purchased: ${data.businessDesign || "No"}
Business Lines Purchased: ${businessLinesCount}
Business Names:
${businessLinesText}

Total Amount: $${totalAmount}
-----------------------

If you did not process your Venmo payment at checkout, please click here to finish payment:
${venmoLink}
`;

    // send emails (if env vars missing, this will throw; that’s okay—we want to see it)
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "New Shirt Order — 14U Wildcats Cheer",
      text: adminEmailText
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: data.email,
      subject: "Your Shirt Order Confirmation — 14U Wildcats Cheer",
      text: customerEmailText
    });

    // IMPORTANT: return BOTH keys so front-end never breaks
    return res.json({
      venmoLink,
      amount: totalAmount,
      totalAmount
    });

  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// CSV download
app.get("/admin/orders.csv", (req, res) => {
  res.download(CSV_FILE, "orders.csv");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open: http://localhost:${PORT}`);
  console.log(`CSV:  http://localhost:${PORT}/admin/orders.csv`);
});
