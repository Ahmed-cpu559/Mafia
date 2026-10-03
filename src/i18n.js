let currentLang = 'en';

export const translations = {
  en: {}, // Fallback is the key itself
  ar: {
    // General
    "MAFIA": "مافيا",
    "A social deduction game of hidden roles, secret kills, and village justice.": "لعبة استنتاج اجتماعي بأدوار خفية، اغتيالات سرية، وعدالة القرية.",
    "Create New Game": "إنشاء لعبة جديدة",
    "Demo Scenarios": "سيناريوهات تجريبية",
    "Back": "رجوع",
    "Time Remaining": "الوقت المتبقي",
    "Round": "الجولة",
    
    // Setup
    "Game Setup": "إعدادات اللعبة",
    "Game Code": "رمز اللعبة",
    "Players": "اللاعبين",
    "Number of Players (excluding Sage)": "عدد اللاعبين (باستثناء الحكيم)",
    "Roles": "الأدوار",
    "🔪 Mafia": "🔪 مافيا",
    "💊 Doctor": "💊 طبيب",
    "🔍 Officer": "🔍 ضابط",
    "👤 Citizen": "👤 مواطن",
    "Game Mode": "نمط اللعبة",
    "🧙 Sage Controlled": "🧙 تحكم الحكيم",
    "The Sage manually controls phase progression and timing.": "يتحكم الحكيم يدوياً في تقدم المراحل والوقت.",
    "⚡ Automated": "⚡ تلقائي",
    "The system automatically advances phases when timers expire.": "يتقدم النظام تلقائياً عند انتهاء الوقت.",
    "Awareness Modes": "أنماط المعرفة",
    "🔪 Mafia Awareness": "🔪 معرفة المافيا",
    "💊 Doctor Awareness": "💊 معرفة الأطباء",
    "🔍 Officer Awareness": "🔍 معرفة الضباط",
    "Group": "مجموعة",
    "Individual": "فردي",
    "Role Reveal After Voting": "كشف الدور بعد التصويت",
    "Yes": "نعم",
    "No": "لا",
    "Create & Start Game": "إنشاء وبدء اللعبة",

    // Roles & Phases
    "Mafia": "مافيا",
    "Doctor": "طبيب",
    "Officer": "ضابط",
    "Citizen": "مواطن",
    "Lobby": "غرفة الانتظار",
    "Role Assignment": "توزيع الأدوار",
    "Mafia Phase": "مرحلة المافيا",
    "Doctor Phase": "مرحلة الطبيب",
    "Officer Phase": "مرحلة الضابط",
    "Resolution": "النتيجة",
    "Morning": "الصباح",
    "Discussion": "النقاش",
    "Voting": "التصويت",
    "Vote Results": "نتائج التصويت",
    "Game Over": "نهاية اللعبة",
    
    // UI Game
    "👁️ View As:": "👁️ عرض كـ:",
    "🧙 Sage": "🧙 الحكيم",
    "Exit Game": "الخروج",
    
    // Sage View
    "Current Phase": "المرحلة الحالية",
    "Advance Phase": "المرحلة التالية",
    "Alive": "أحياء",
    "Dead": "أموات",
    "Nobody died last night.": "لم يمت أحد الليلة الماضية.",
    "Private Investigation Results:": "نتائج التحقيق السري:",
    "Reveal to Officer": "كشف للضابط",
    "Revealed": "تم الكشف",
    "Announcements": "إعلانات",
    "Send Announcement": "إرسال إعلان",
    "Game Log": "سجل اللعبة",
    
    // Player View
    "Your Secret Role": "دورك السري",
    "Your Team": "فريقك",
    "Village": "القرية",
    "Work with your fellow Mafia to eliminate the Village.": "اعمل مع زملائك في المافيا للقضاء على القرية.",
    "Work with the Village to find and eliminate the Mafia.": "اعمل مع القرية للعثور على المافيا والقضاء عليها.",
    "Action Submitted": "تم إرسال الإجراء",
    "Waiting for the phase to end...": "في انتظار انتهاء المرحلة...",
    "Retract & Change Target": "تراجع وتغيير الهدف",
    "Select a player to eliminate.": "اختر لاعباً للاستبعاد.",
    "Select a player to protect.": "اختر لاعباً لحمايته.",
    "Select a player to investigate.": "اختر لاعباً للتحقيق معه.",
    "Confirm Selection": "تأكيد الاختيار",
    "Mafia Chat": "دردشة المافيا",
    "Public Chat": "الدردشة العامة",
    "Village Square": "ساحة القرية",
    "The Village Wakes Up": "تستيقظ القرية",
    "Discuss and find the Mafia!": "ناقشوا واكتشفوا المافيا!",
    "Submit Vote": "تأكيد التصويت",
    "You have voted for": "لقد قمت بالتصويت لـ",
    "Vote Tally": "فرز الأصوات",
    "Target": "الهدف",
    "Votes": "الأصوات",
    "Eliminated!": "مستبعد!",
    "No one was eliminated (Tie)": "لم يتم استبعاد أحد (تعادل)",
    "Private Investigation Result": "نتيجة التحقيق السري",
    "You investigated": "لقد قمت بالتحقيق مع",
    "and the Sage revealed they are:": "والحكيم كشف أنهم:",
    "INNOCENT": "بريء",

    // Chat
    "Type a message...": "اكتب رسالة...",
    "Send": "إرسال"
  }
};

export function setLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export function getLang() {
  return currentLang;
}

export function t(key) {
  if (currentLang === 'en') return key;
  return translations[currentLang][key] || key;
}
