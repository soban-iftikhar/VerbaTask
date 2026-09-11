import PDFDocument from 'pdfkit-table';
import fs from 'fs';

function reverseWords(str) {
  if (!str) return '';
  return str.split(' ').reverse().join(' ');
}

const URDU_FONT = '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf';
const URDU_FONT_BOLD = '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf';
const HAS_URDU_FONT = fs.existsSync(URDU_FONT);

async function generateManual() {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 32, bottom: 32, left: 36, right: 36 },
    bufferPages: true,
  });

  const outputPathRoot = '/home/soban-iftikhar/Projects/VerbaTask/VerbaTask_User_Manual.pdf';
  const outputPathPublic = '/home/soban-iftikhar/Projects/VerbaTask/frontend/public/VerbaTask_User_Manual.pdf';
  const outputPathArtifact = '/home/soban-iftikhar/.gemini/antigravity/brain/eb63d097-f8e8-4baf-8604-99c53610e29a/VerbaTask_User_Manual.pdf';

  const writeStreams = [
    fs.createWriteStream(outputPathRoot),
    fs.createWriteStream(outputPathPublic),
    fs.createWriteStream(outputPathArtifact),
  ];

  doc.on('data', (chunk) => {
    writeStreams.forEach((ws) => ws.write(chunk));
  });

  doc.on('end', () => {
    writeStreams.forEach((ws) => ws.end());
  });

  const THEME_GREEN = '#059669';
  const THEME_DARK = '#0F172A';
  const THEME_LIGHT_BG = '#F0FDF4';
  const THEME_BORDER = '#A7F3D0';

  // ==========================================
  // PAGE 1: OVERVIEW & QUICK CHEAT SHEET
  // ==========================================

  // Brand Accent Line
  doc.rect(36, 25, 523, 5).fill(THEME_GREEN);

  // Title & Subtitle
  doc.font('Helvetica-Bold').fontSize(20).fillColor(THEME_DARK).text('VerbaTask User Manual & Commands Guide', 36, 38);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(THEME_GREEN).text('Voice-First AI Retail CRM, Stock Management & Real-Time WhatsApp Parity', 36, 62);

  // Status Badges
  const badgesY = 78;
  const badges = [
    { text: 'WhatsApp Voice OS', w: 110 },
    { text: 'Bilingual English & Urdu', w: 120 },
    { text: 'Web Dashboard Parity', w: 115 },
    { text: 'Groq Whisper + Qwen-2.5', w: 130 },
  ];
  let badgeX = 36;
  badges.forEach((b) => {
    doc.roundedRect(badgeX, badgesY, b.w, 16, 4).fillAndStroke(THEME_LIGHT_BG, THEME_BORDER);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(THEME_GREEN).text(b.text, badgeX + 6, badgesY + 4);
    badgeX += b.w + 8;
  });

  // Architecture Box
  const archY = 104;
  doc.roundedRect(36, archY, 523, 64, 5).fillAndStroke('#F8FAFC', '#E2E8F0');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(THEME_DARK).text('HOW VERBATASK WORKS (VOICE & NLP PIPELINE)', 46, archY + 8);
  doc.font('Helvetica').fontSize(7.5).fillColor('#334155').text(
    '1. Shopkeeper sends an audio Voice Note or typed text via WhatsApp in English, Urdu, or Roman Urdu.\n' +
    '2. Groq Whisper transcribes speech -> Qwen-2.5 extracts structured intents (Sales, Restocks, Settings, Reports).\n' +
    '3. MongoDB updates stock & financial balances -> WebSockets emit instant telemetry to the Web Dashboard.\n' +
    '4. Edge Neural TTS synthesizes a natural spoken voice note and sends it back to WhatsApp with a text receipt.',
    46, archY + 20, { width: 502, lineGap: 2 }
  );

  // Quick Cheat Sheet Table
  const cheatSheetTable = {
    title: 'QUICK START COMMANDS CHEAT SHEET',
    headers: [
      { label: 'Feature / Action', property: 'feature', width: 105 },
      { label: 'Voice / English Example', property: 'example', width: 150 },
      { label: 'Roman Urdu Command', property: 'roman', width: 125 },
      { label: 'Dashboard Live Result', property: 'result', width: 130 },
    ],
    datas: [
      {
        feature: 'Log Sale (Voice)',
        example: '"2 kg sugar cash"\n"5 rice easypaisa"',
        roman: '"2 chini cash"\n"5 chawal easypaisa"',
        result: 'Deducts stock, logs sale, emits live order event.',
      },
      {
        feature: 'Add Stock (Restock)',
        example: '"add 50 rice price 300"\n"restock 10 cooking oil"',
        roman: '"maal aya 20 chini"\n"20 kilo chawal aaye hain"',
        result: 'Increments inventory, updates price, alerts dashboard.',
      },
      {
        feature: 'Set Item Price',
        example: '"set price rice 320"\n"price cooking oil 500"',
        roman: '"chini ki price 160"\n"rate doodh 220"',
        result: 'Updates item selling price and broadcasts live change.',
      },
      {
        feature: 'Check Stock',
        example: '"stock rice"\n"how much sugar left"',
        roman: '"chini kitni hai"\n"doodh kitna bacha hai"',
        result: 'Replies with available quantity, unit, and price.',
      },
      {
        feature: 'Store Settings',
        example: '"set name Madina Store"\n"set location Lahore"',
        roman: '"dukaan ka naam [naam]"\n"voice on" / "voice off"',
        result: 'Updates profile & toggles spoken voice replies.',
      },
      {
        feature: 'Pakistani Banks',
        example: '"enable easypaisa"\n"disable jazzcash"',
        roman: '"easypaisa on karo"\n"jazzcash band karo"',
        result: 'Toggles active digital wallets and bank channels.',
      },
      {
        feature: 'PDF Reports',
        example: '"sales report"\n"inventory report"',
        roman: '"report" / "hisab report"\n"kam stock report"',
        result: 'Sends instant downloadable PDF report in chat.',
      },
    ],
  };

  doc.x = 36;
  doc.y = 175;
  await doc.table(cheatSheetTable, {
    prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME_DARK),
    prepareRow: () => doc.font('Helvetica').fontSize(7.5).fillColor('#334155'),
    padding: [3, 5, 3, 5],
    divider: {
      header: { disabled: false, width: 1, opacity: 0.6 },
      horizontal: { disabled: false, width: 0.5, opacity: 0.2 },
    },
  });

  // Callout Box
  const calloutY = doc.y + 10;
  doc.roundedRect(36, calloutY, 523, 40, 5).fillAndStroke(THEME_LIGHT_BG, THEME_BORDER);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME_GREEN).text('[INFO] INTERACTIVE BUTTONS & GUIDED FLOWS ("order" / "help")', 46, calloutY + 7);
  doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B').text(
    'Merchants who prefer tapping buttons over typing can type "order" to browse products and select payment methods via interactive buttons, or type "help" at any moment to see the interactive feature launcher.',
    46, calloutY + 20, { width: 502 }
  );

  // ==========================================
  // PAGE 2: COMPREHENSIVE ENGLISH USER GUIDE
  // ==========================================
  doc.addPage();
  doc.rect(36, 25, 523, 5).fill(THEME_GREEN);

  doc.font('Helvetica-Bold').fontSize(18).fillColor(THEME_DARK).text('English Commands & Operations Guide', 36, 38);
  doc.font('Helvetica').fontSize(8.5).fillColor('#64748B').text('Detailed breakdown of all WhatsApp chat commands, syntax variations, and workflows', 36, 58);

  const englishSectionsTable = {
    headers: [
      { label: 'Category', property: 'category', width: 95 },
      { label: 'Commands & Variations', property: 'commands', width: 180 },
      { label: 'Action & Dashboard Parity', property: 'action', width: 245 },
    ],
    datas: [
      {
        category: '1. Log Sales\n(Voice & Text)',
        commands: '• Voice: "2 kg sugar cash"\n• Text: "5 rice easypaisa"\n• Text: "10 milk jazzcash"\n• Quick: "chawal" (defaults 1 cash)\n• Button: "order" (guided picker)',
        action: 'Deducts sold quantity from stock, creates order with unique ID, logs payment channel (Cash, EasyPaisa, JazzCash, SadaPay, etc.), emits WebSocket update, and returns voice note + receipt.',
      },
      {
        category: '2. Stock Restock\n& Price Setting',
        commands: '• "add 50 rice price 300"\n• "maal aya 20 chini"\n• "set price rice 320"\n• "price chini 160"\n• "stock list" or "inventory"',
        action: 'Increments existing stock quantity via cross-lingual fuzzy matching, updates item price/units, or automatically creates a new item if not in inventory. "stock list" displays summary with low-stock warnings.',
      },
      {
        category: '3. Stock Queries\n(Item Checks)',
        commands: '• "stock rice"\n• "rice kitna hai"\n• "how much sugar left"\n• "chini kitni hai"\n• "doodh kitna bacha hai"',
        action: 'Instantly checks live MongoDB inventory for the specific item and replies with available quantity, unit, and price per unit.',
      },
      {
        category: '4. PDF Reports\n(Instant Delivery)',
        commands: '• "report" (interactive menu)\n• "sales report"\n• "inventory report"\n• "low stock report"\n• "expiring report"\n• "top selling report"',
        action: 'Generates professional multi-page PDF documents and uploads them directly to WhatsApp as downloadable document attachments.',
      },
      {
        category: '5. Store Settings\n(Full Parity)',
        commands: '• "profile" or "settings"\n• "set name [New Name]"\n• "set location [City]"\n• "voice on" / "voice off"\n• "english" / "urdu"',
        action: 'Allows merchants to manage store details without opening a computer. Renames business, changes location, and toggles spoken audio replies.',
      },
      {
        category: '6. Payment &\nPakistani Banks',
        commands: '• "banks" or "payment methods"\n• "enable easypaisa"\n• "disable jazzcash"\n• "enable sadapay"\n• "enable meezan"',
        action: 'Lists all Pakistani digital wallets and bank channels with active/inactive indicators. Toggles accepted payment methods in sales flows.',
      },
      {
        category: '7. Automations\n& Alerts',
        commands: '• Voice: "Alert me when oil is below 5"\n• Text: "notify me on low sugar"\n• Text: "workflows" or "alerts"',
        action: 'Creates AI threshold rules that automatically trigger WhatsApp notifications when inventory levels breach the specified limits.',
      },
    ],
  };

  doc.x = 36;
  doc.y = 74;
  await doc.table(englishSectionsTable, {
    prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME_DARK),
    prepareRow: () => doc.font('Helvetica').fontSize(7.5).fillColor('#334155'),
    padding: [4, 5, 4, 5],
    divider: {
      header: { disabled: false, width: 1, opacity: 0.6 },
      horizontal: { disabled: false, width: 0.5, opacity: 0.2 },
    },
  });

  // ==========================================
  // PAGE 3: URDU USER MANUAL (مکمل اردو رہنمائی)
  // ==========================================
  doc.addPage();
  doc.rect(36, 25, 523, 5).fill(THEME_GREEN);

  // Urdu Header Block
  doc.font('Helvetica-Bold').fontSize(18).fillColor(THEME_DARK).text('Urdu Commands & Operations Guide', 36, 38);
  doc.font('Helvetica').fontSize(8.5).fillColor('#64748B').text('Complete Pakistani merchant operations guide in Roman Urdu and Urdu script', 36, 58);

  const urduSectionsTable = {
    headers: [
      { label: "Category (Shu'ba)", property: 'category', width: 95 },
      { label: 'Commands & Spoken Examples', property: 'commands', width: 180 },
      { label: 'Urdu Description & System Action', property: 'action', width: 245 },
    ],
    datas: [
      {
        category: '1. Sales & Orders\n(Bikri ka Indiraj)',
        commands: '• Voice: "do kilo chini cash"\n• Voice: "5 chawal easypaisa"\n• Text: "2 rice cash"\n• Text: "10 doodh jazzcash"\n• Button: "order" ya "sale"',
        action: 'Inventory se saman kam hoga, amdan darj hogi, payment channel save hoga aur WhatsApp par voice note aur receipt pohnch jaye gi.',
      },
      {
        category: '2. Stock & Price\n(Naya Maal & Qeemat)',
        commands: '• "maal aya 20 chini"\n• "add 50 rice price 300"\n• "chini ki price 160"\n• "set price doodh 220"\n• "stock list" ya "saman"',
        action: 'Purane stock mein tadad jama ho jaye gi ya nayi cheez khud-ba-khud ban jaye gi. Qeemat set ya update hogi aur live sync hoga.',
      },
      {
        category: '3. Stock Queries\n(Saman Maloomat)',
        commands: '• "stock rice"\n• "chini kitni hai"\n• "chawal ka stock kitna hai"\n• "doodh kitna bacha hai"',
        action: 'Fori tor par bataye ga ke is cheez ki kitni miqdar aur kya qeemat dukan mein baqi bachi hai.',
      },
      {
        category: '4. PDF Reports\n(Khata & Reports)',
        commands: '• "report" (interactive buttons)\n• "sales report" (bikri report)\n• "inventory report" (saman)\n• "low stock report" (kam stock)',
        action: 'Mukammal dukan ka hisab aur report PDF format mein foran WhatsApp chat mein download ke liye bhej di jaye gi.',
      },
      {
        category: '5. Store Settings\n(Dukan Settings)',
        commands: '• "profile" ya "settings"\n• "set name [Naya Naam]"\n• "set location [Shehar]"\n• "voice on" / "voice off"\n• "urdu" / "english"',
        action: 'Dukan ka naam, shehar, zuban aur voice replies WhatsApp se badlein. Dashboard par baghair computer ke fori update ho jata hai.',
      },
      {
        category: '6. Payment Banks\n(Wallets & Banks)',
        commands: '• "banks" (tamam tareeqay)\n• "enable easypaisa"\n• "disable jazzcash"\n• "enable sadapay"\n• "enable meezan"',
        action: 'Pakistani digital wallets aur banks ki list dekhein aur dukan ke liye tareeqay active ya band karein.',
      },
      {
        category: '7. Automations\n(Khudkar Alerts)',
        commands: '• Voice: "Jab tel 5 se kam ho alert karo"\n• Text: "notify me on low sugar"\n• Text: "workflows" ya "alerts"',
        action: 'Kam stock ka alert banayein. Jab bhi saman khatam hone wala hoga, system khud-ba-khud WhatsApp par khabardar kar dega.',
      },
    ],
  };

  doc.x = 36;
  doc.y = 74;
  await doc.table(urduSectionsTable, {
    prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME_DARK),
    prepareRow: () => doc.font('Helvetica').fontSize(7.5).fillColor('#334155'),
    padding: [4, 5, 4, 5],
    divider: {
      header: { disabled: false, width: 1, opacity: 0.6 },
      horizontal: { disabled: false, width: 0.5, opacity: 0.2 },
    },
  });

  // Dedicated Urdu Script Showcase Banner
  if (HAS_URDU_FONT) {
    const urduBoxY = doc.y + 10;
    doc.roundedRect(36, urduBoxY, 523, 42, 5).fillAndStroke('#F8FAFC', '#CBD5E1');
    doc.font(URDU_FONT_BOLD || URDU_FONT).fontSize(10).fillColor(THEME_DARK).text(reverseWords('اردو وائس نوٹ بولنے کی چند آسان مثالیں:'), 46, urduBoxY + 6, { align: 'right', width: 502 });
    doc.font(URDU_FONT).fontSize(8.5).fillColor('#334155').text(
      reverseWords('سیل: «دو کلو چینی کیش» ، نیا مال: «بیس کلو چاول آئے ہیں» ، اسٹاک: «چینی کتنی ہے» ، کھاتہ: «رپورٹ بھیجو»'),
      46, urduBoxY + 22, { align: 'right', width: 502 }
    );
  }

  // ==========================================
  // PAGE 4: TIPS FOR MERCHANTS & FAQ MATRIX
  // ==========================================
  doc.addPage();
  doc.rect(36, 25, 523, 5).fill(THEME_GREEN);

  doc.font('Helvetica-Bold').fontSize(18).fillColor(THEME_DARK).text('Merchant Best Practices & Technical Reference', 36, 38);
  doc.font('Helvetica').fontSize(8.5).fillColor('#64748B').text('Voice recording tips, multi-channel payment matrix, and troubleshooting', 36, 58);

  // Tip 1 & 2 Cards
  const tipY = 74;
  doc.roundedRect(36, tipY, 255, 92, 5).fillAndStroke('#F8FAFC', '#E2E8F0');
  doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME_GREEN).text('[TIPS] VOICE NOTE RECORDING ADVICE', 46, tipY + 8);
  doc.font('Helvetica').fontSize(7.5).fillColor('#334155').text(
    '• Speak naturally: "2 kg chini cash" or "do kilo chawal easypaisa".\n' +
    '• Noisy bazaar conditions: Hold the phone mic close. Groq Whisper handles background market noise robustly.\n' +
    '• Mixed language: You can freely mix Urdu and English (e.g. "5 milk jazzcash pe becha").\n' +
    '• Dialects: Optimally tuned for Pakistani retail accents.',
    46, tipY + 22, { width: 235, lineGap: 2 }
  );

  doc.roundedRect(304, tipY, 255, 92, 5).fillAndStroke('#F8FAFC', '#E2E8F0');
  doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME_GREEN).text('[SYNC] REAL-TIME DASHBOARD TELEMETRY', 314, tipY + 8);
  doc.font('Helvetica').fontSize(7.5).fillColor('#334155').text(
    '• Zero page refresh required: The web dashboard uses Socket.IO WebSocket telemetry.\n' +
    '• Sales, inventory increments, low-stock warnings, and store renaming reflect in under 150ms.\n' +
    '• Multi-user access: Cashiers and store owners can view dashboard simultaneously while messages arrive.',
    314, tipY + 22, { width: 235, lineGap: 2 }
  );

  // Supported Banks Catalog Table
  const banksTable = {
    title: 'PAKISTANI PAYMENT METHODS & DIGITAL WALLETS CATALOG',
    headers: [
      { label: 'Category', property: 'cat', width: 80 },
      { label: 'Provider / Channel', property: 'provider', width: 135 },
      { label: 'Activation Command', property: 'cmd', width: 135 },
      { label: 'Status & Description', property: 'status', width: 160 },
    ],
    datas: [
      { cat: 'Cash', provider: 'Cash on Hand (Naqad)', cmd: 'Default active', status: 'Primary store currency' },
      { cat: 'Digital Wallet', provider: 'Easypaisa (Telenor)', cmd: '"enable easypaisa"', status: 'QR & mobile number payments' },
      { cat: 'Digital Wallet', provider: 'JazzCash (Mobilink)', cmd: '"enable jazzcash"', status: 'USSD & wallet transfers' },
      { cat: 'EMI Wallet', provider: 'SadaPay', cmd: '"enable sadapay"', status: 'Fast debit card / IBAN transfers' },
      { cat: 'EMI Wallet', provider: 'NayaPay', cmd: '"enable nayapay"', status: 'Merchant digital payments' },
      { cat: 'Instant P2P', provider: 'Raast (State Bank)', cmd: '"enable raast"', status: 'Instant zero-fee banking' },
      { cat: 'Islamic Bank', provider: 'Meezan Bank', cmd: '"enable meezan"', status: 'Shariah-compliant banking' },
      { cat: 'Commercial', provider: 'HBL / UBL / Alfalah', cmd: '"enable hbl" / "ubl"', status: 'Major Pakistani banks' },
    ],
  };

  doc.x = 36;
  doc.y = 178;
  await doc.table(banksTable, {
    prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME_DARK),
    prepareRow: () => doc.font('Helvetica').fontSize(7.5).fillColor('#334155'),
    padding: [3.5, 5, 3.5, 5],
    divider: {
      header: { disabled: false, width: 1, opacity: 0.6 },
      horizontal: { disabled: false, width: 0.5, opacity: 0.2 },
    },
  });

  // Footer Note & Help Desk Box
  const footerBoxY = doc.y + 10;
  doc.roundedRect(36, footerBoxY, 523, 40, 5).fillAndStroke('#F1F5F9', '#CBD5E1');
  doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME_DARK).text('NEED ASSISTANCE OR LIVE DEMO ACCOUNT?', 46, footerBoxY + 7);
  doc.font('Helvetica').fontSize(7.5).fillColor('#475569').text(
    'Demo Credentials: sheikhmuhammadali3@gmail.com / ali123456 | Web App: https://verba-task.netlify.app\n' +
    'VerbaTask is designed for 100% voice & mobile operation. Type "help" in WhatsApp at any time to open the commands guide.',
    46, footerBoxY + 19, { width: 502 }
  );

  // ==========================================
  // FOOTERS ON ALL PAGES
  // ==========================================
  const range = doc.bufferedPageRange();

  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    const dividerY = doc.page.height - 26;
    const footerY = doc.page.height - 20;

    doc.moveTo(36, dividerY).lineTo(559, dividerY).lineWidth(0.5).strokeColor('#E2E8F0').stroke();

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748B').text('VerbaTask User Manual', 36, footerY, { lineBreak: false });
    doc.font('Helvetica').fontSize(7.5).fillColor('#94A3B8').text('  •  Voice-First Retail CRM for Pakistan', 135, footerY, { lineBreak: false });

    doc.font('Helvetica').fontSize(7.5).fillColor('#94A3B8').text(
      `Page ${i + 1} of ${range.count}`,
      380, footerY, { width: 179, align: 'right', lineBreak: false }
    );
  }

  doc.end();

  return new Promise((resolve, reject) => {
    writeStreams[0].on('finish', () => {
      console.log('User manual PDF generated at:');
      console.log(' - ' + outputPathRoot);
      console.log(' - ' + outputPathPublic);
      console.log(' - ' + outputPathArtifact);
      resolve({ outputPathRoot, outputPathPublic, outputPathArtifact });
    });
    writeStreams[0].on('error', reject);
  });
}

generateManual().catch((err) => {
  console.error('Failed to generate user manual PDF:', err);
  process.exit(1);
});
