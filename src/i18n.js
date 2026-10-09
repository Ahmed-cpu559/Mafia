let currentLang = 'en';

export const translations = {
  en: {}, // Fallback is the key itself
  ar: {
    // General & Branding
    "MAFIA": "مافيا",
    "A social deduction game of hidden roles, secret kills, and village justice.": "لعبة استنتاج اجتماعي بأدوار خفية، اغتيالات سرية، وعدالة القرية.",
    "Create New Game": "إنشاء لعبة جديدة",
    "Your Name (Village Sage)": "اسمك (حكيم القرية)",
    "Village Sage": "حكيم القرية",
    "Create Room": "إنشاء الغرفة",
    "Join Game": "الانضمام للعبة",
    "Your Name": "اسمك",
    "Room Code": "رمز الغرفة",
    "4-Digit Room Code (e.g. 1234)": "رمز الغرفة (4 أرقام مثال: 1234)",
    "Join Room": "دخول الغرفة",
    "Back": "رجوع",
    "Time Remaining": "الوقت المتبقي",
    "Round": "الجولة",
    "Round 1": "الجولة 1",
    "Round 2": "الجولة 2",
    "Round 3": "الجولة 3",
    "TIME REMAINING": "الوقت المتبقي",
    "Leave Room": "مغادرة الغرفة",
    "Leave the room?": "هل تريد مغادرة الغرفة؟",
    "Are you sure you want to leave the game?": "هل أنت متأكد من مغادرة اللعبة؟",
    "Waiting for Village Sage": "في انتظار حكيم القرية",
    "Waiting for game to start": "في انتظار بدء اللعبة",
    "The Sage will start the game soon. You can stay in the room or leave.": "الراوي سيبدأ اللعبة قريباً. يمكنك البقاء في الغرفة أو المغادرة.",
    "Game Cancelled": "تم إلغاء اللعبة",
    "The Sage has cancelled the game. You can leave the room.": "قام الراوي بإلغاء اللعبة. يمكنك مغادرة الغرفة.",
    "The Sage is configuring roles and preparing to start the game.": "يقوم الحكيم بضبط الأدوار وتجهيز اللعبة للبدء.",
    "Joined Players": "اللاعبون المنضمون",
    "Waiting for other players...": "في انتظار انضمام باقي اللاعبين...",
    "You": "أنت",
    "Share this code with players so they can join!": "شارك هذا الرمز مع أصدقائك لينضموا للعبة!",
    "Auto-updating...": "تحديث تلقائي...",
    "Waiting for players to join...": "في انتظار انضمام اللاعبين...",
    "Kick player": "طرد اللاعب",
    "Are you sure you want to remove this player?": "هل أنت متأكد من رغبتك في إزالة هذا اللاعب؟",

    // Setup Validation & Roles
    "Game Setup": "إعدادات اللعبة",
    "Game Code": "رمز الغرفة",
    "Roles": "الأدوار",
    "Role Distribution": "طريقة توزيع الأدوار",
    "🎲 Random Distribution": "🎲 توزيع عشوائي",
    "Randomly shuffle and distribute configured roles to players.": "توزيع الأدوار المحددة عشوائياً بين اللاعبين المنضمين.",
    "✍️ Manual Distribution (Sage Assigns)": "✍️ توزيع يدوي (الراوي يحدد الأدوار)",
    "You manually select each player's specific role.": "يقوم الراوي بتحديد دور كل لاعب بالاسم يدوياً.",
    "Assign Roles to Players": "تعيين الأدوار للاعبين",
    "Manual distribution ready —": "التوزيع اليدوي جاهز —",
    "🔪 Mafia": "🔪 مافيا",
    "💊 Doctor": "💊 طبيب",
    "🔍 Officer": "🔍 ضابط",
    "👤 Citizen": "👤 مواطن",
    "At least 1 Mafia is required": "يجب وجود مافيا واحدة على الأقل",
    "Role count": "عدد الأدوار",
    "doesn't match player count": "لا يطابق عدد اللاعبين",
    "Configuration valid —": "الإعدادات صحيحة —",
    "players ready": "لاعبين جاهزين",
    "Start Game": "بدء اللعبة",

    // Game Modes & Awareness
    "Game Mode": "نمط اللعبة",
    "🧙 Sage Controlled": "🧙 تحكم الحكيم",
    "The Sage manually controls phase progression and timing.": "يتحكم الحكيم يدوياً في تقدم المراحل والتوقيت.",
    "⚡ Automated": "⚡ تلقائي",
    "The system automatically advances phases when timers expire.": "يتقدم النظام تلقائياً عند انتهاء الوقت.",
    "Awareness Modes": "أنماط المعرفة",
    "🔪 Mafia Awareness": "🔪 معرفة المافيا",
    "💊 Doctor Awareness": "💊 معرفة الأطباء",
    "🔍 Officer Awareness": "🔍 معرفة الضباط",
    "Group (Teammates know each other)": "مجموعة (يعرفون بعضهم البعض)",
    "Individual (Blind)": "فردي (لا يعرفون بعضهم)",
    "Group": "مجموعة (يعرفون بعضهم)",
    "Individual": "فردي (لا يعرفون بعضهم)",
    "Role Reveal After Voting": "كشف الدور بعد الاستبعاد",
    "Yes": "نعم",
    "No": "لا",

    // Roles & Teams
    "Mafia": "مافيا",
    "Doctor": "طبيب",
    "Officer": "ضابط",
    "Citizen": "مواطن",
    "VILLAGE": "القرية",
    "MAFIA": "المافيا",
    "Village": "القرية",
    "Team:": "الفريق:",
    "Team": "الفريق",

    // Phases
    "Lobby": "غرفة الانتظار",
    "Role Assignment": "توزيع الأدوار",
    "Night Setup": "تجهيز الليل",
    "Night Phase": "مرحلة الليل",
    "Mafia Phase": "مرحلة المافيا",
    "Doctor Phase": "مرحلة الطبيب",
    "Officer Phase": "مرحلة الضابط",
    "Resolution": "النتيجة",
    "Morning": "الصباح",
    "Discussion": "النقاش",
    "Voting": "التصويت",
    "Vote Results": "نتائج التصويت",
    "Finished": "نهاية اللعبة",
    "Game Over": "نهاية اللعبة",

    // Role Reveal
    "Your Secret Role": "دورك السري",
    "I Memorized My Role (Hide)": "حفظت دوري (إخفاء)",
    "Role Hidden for Privacy": "تم إخفاء الدور للخصوصية",
    "Nobody around you can peek at your screen. You can use \"Hold to Peek\" anytime.": "لا يمكن لأحد بجانبك رؤية شاشتك. يمكنك الضغط المطول للمعاينة في أي وقت.",
    "Reveal Role Again": "إظهار الدور مرة أخرى",
    "Hold to Peek": "اضغط للمعاينة",
    "Peeking...": "جاري العرض...",
    "Waiting for Sage to start the game...": "في انتظار الحكيم لبدء اللعبة...",

    // Hints
    "Work with your team to eliminate the village at night. Blend in during the day.": "تعاون مع فريقك للقضاء على أهل القرية ليلاً، وتظاهر بالبراءة نهاراً.",
    "Choose one player each night to protect from the Mafia. You can protect yourself, but not twice in a row.": "اختر لاعباً واحداً كل ليلة لحمايته من المافيا. يمكنك حماية نفسك، ولكن ليس مرتين متتاليتين.",
    "Investigate one player each night to learn if they are Mafia or Innocent.": "حقّق مع لاعب واحد كل ليلة لمعرفة ما إذا كان من المافيا أم بريئاً.",
    "You have no special night abilities. Use your wits during the day to find the Mafia.": "ليس لديك قدرات ليلية خاصة. استخدم ذكاءك أثناء النهار لكشف المافيا والتصويت ضدهم.",

    // Night & Setup Phases
    "Night Preparation": "تجهيز مرحلة الليل",
    "The Night Falls...": "حلّ الليل على القرية...",
    "The Village Sage is setting up tonight's round rules. Rest and prepare.": "يقوم حكيم القرية بضبط قواعد الليلة. استعدوا للراحة.",
    "🌙 The Village Sleeps...": "🌙 القرية نائمة...",
    "The Village Sage is setting up tonight's round rules. Prepare yourselves.": "يقوم حكيم القرية بضبط قواعد الليلة. استعدوا.",
    "Start Night Phase": "بدء مرحلة الليل",
    "Adjust Round Configuration": "ضبط إعدادات الجولة",
    "Set allowances below, then start the night phase when ready.": "حدد عدد الإجراءات المسموحة بالأسفل، ثم ابدأ مرحلة الليل عند الجاهزية.",
    "Adjust action allowances for Round": "تعديل عدد الإجراءات للجولة",
    "before players wake up": "قبل استيقاظ اللاعبين",
    "Dynamic Round Configuration": "إعدادات الجولة الديناميكية",
    "🔪 Mafia Kills": "🔪 اغتيالات المافيا",
    "💊 Doctor Heals": "💊 علاجات الأطباء",
    "🔍 Officer Invs": "🔍 تحقيقات الضباط",
    "Changes apply immediately to the current round.": "تُطبّق التغييرات فوراً على الجولة الحالية.",
    "Select Kill Targets": "اختر أهداف الاغتيال",
    "Select Heal Targets": "اختر أهداف الحماية",
    "Select Investigation Target": "اختر هدف التحقيق",
    "Choose 1 player to investigate.": "اختر لاعباً واحداً للتحقيق معه.",
    "Choose up to": "اختر حتى",
    "players to eliminate.": "لاعبين للاستبعاد.",
    "players to protect.": "لاعبين لحمايتهم.",
    "🌙 Night Deliberation": "🌙 تداول واستنتاج الليل",
    "Night Deliberation: Choose who you suspect is Mafia tonight.": "تداول الليل: اختر من تشتبه في أنه من المافيا الليلة.",
    "Selected": "المحدد",
    "Confirm Selection": "تأكيد الاختيار",
    "Action Submitted": "تم تسجيل الإجراء",
    "Waiting for the phase to end...": "في انتظار انتهاء المرحلة...",
    "Retract & Change Target": "تراجع وتغيير الاختيار",
    "Known Mafia": "أعضاء المافيا المعروفون",
    "Mafia Chat": "دردشة المافيا الخاصة",
    "Public Chat": "الدردشة العامة",
    "Graveyard Chat": "دردشة الأموات",

    // Morning & Resolution
    "The sun is rising...": "تشرق شمس الصباح...",
    "The Sage is preparing the morning announcements.": "يقوم الحكيم بتجهيز إعلانات الصباح.",
    "Nobody died last night.": "لم يمت أحد الليلة الماضية.",
    "died last night.": "مات الليلة الماضية.",
    "Private Investigation Result": "نتيجة التحقيق السري",
    "You investigated": "لقد حققت مع",
    "and the Sage revealed they are:": "وكشف الحكيم أنه:",
    "Dismiss": "إخفاء",
    "View Investigation Result": "عرض نتيجة التحقيق",
    "INNOCENT": "بريء 🕊️",
    "MAFIA": "مافيا 🔪",
    "Innocent": "بريء 🕊️",
    "Morning Announcements": "إعلانات الصباح",
    "Private Investigation Results:": "نتائج التحقيقات السرية:",
    "Reveal to Officer": "كشف للضابط",
    "Revealed": "تم الكشف",
    "Nobody Died": "لم يمت أحد",
    "Resolution Summary": "ملخص النتيجة",
    "Mafia Targets": "أهداف المافيا",
    "Doctor Targets": "أهداف الأطباء",

    // Discussion & Voting
    "The Village Wakes Up": "استيقاظ القرية",
    "Discuss and find the Mafia!": "تناقشوا واعثروا على المافيا!",
    "Live Voting": "التصويت المباشر",
    "voted": "صوتوا",
    "No votes cast yet": "لم يتم الإدلاء بأي صوت بعد",
    "Cast your vote for who you think is Mafia.": "أدلِ بصوتك ضد من تعتقد أنه من المافيا.",
    "Submit Vote": "تأكيد التصويت",
    "You have voted for": "لقد قمت بالتصويت لـ",
    "Change Vote": "تغيير التصويت",
    "Voting Results": "نتائج التصويت",
    "Vote Tie! Nobody is eliminated.": "تعادل في الأصوات! لم يتم استبعاد أحد.",
    "has been eliminated!": "تم استبعاده!",
    "Role was:": "كان دوره:",

    // Dead & Graveyard
    "YOU ARE DEAD": "أنت ميّت",
    "You can no longer participate.": "لم يعد بإمكانك المشاركة في اللعبة.",
    "You may watch the game and chat with other dead players.": "يمكنك متابعة مجريات اللعبة والدردشة مع الأموات الآخرين.",

    // Game Over & Citizen Stats
    "WINS!": "فازوا باللعبة!",
    "Congratulations! Your team emerged victorious.": "مبروك! حقق فريقك النصر.",
    "Better luck next time...": "حظاً أوفر في المرة القادمة...",
    "Final Roles": "الأدوار النهائية",
    "🎯 Citizen Deductions & Accuracy": "🎯 استنتاجات ودقة المواطنين",
    "Night suspicions accuracy in identifying Mafia members": "دقة اشتباهات الليل في كشف أعضاء المافيا",
    "No citizen night suspicions were recorded.": "لم يتم تسجيل أي اشتباهات للمواطنين.",

    // Sage Dashboard Controls
    "Current Phase": "المرحلة الحالية",
    "DEV / DEMO CONTROLS": "أدوات التحكم والتحريك",
    "Advance Phase ⏩": "المرحلة التالية ⏩",
    "+30s ⏱️": "+30 ثانية ⏱️",
    "Reset Round ⏪": "إعادة الجولة ⏪",
    "Force Village Win 🏆": "فوز القرية إجبارياً 🏆",
    "Force Mafia Win 🏆": "فوز المافيا إجبارياً 🏆",
    "Cancel Game 🛑": "إلغاء اللعبة 🛑",
    "All Players": "جميع اللاعبين",
    "Alive": "أحياء",
    "Dead": "أموات",
    "Status": "الحالة",
    "Name": "الاسم",
    "Death Info": "معلومات الوفاة",
    "Game Status": "حالة اللعبة",
    "Mafia Remaining:": "المافيا المتبقون:",
    "Village Remaining:": "القرية المتبقون:",
    "Winner": "الفائز",
    "Announcements": "الإعلانات",
    "No announcements yet": "لا توجد إعلانات بعد",
    "View Chat:": "عرض الدردشة:",
    "Type a message...": "اكتب رسالة...",
    "Send": "إرسال",
    "Announce": "نشر الإعلان",
    "Write an announcement...": "اكتب إعلاناً للقرية...",
    "Night Actions & Citizen Suspicions": "إجراءات الليل واشتباهات المواطنين",
    "Waiting for action...": "في انتظار الإجراء...",
    "Suspecting:": "يشتبه في:",
    "Target:": "الهدف:",
    "Result:": "النتيجة:"
  }
};

export function setLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  localStorage.setItem('mafia_lang', lang);
}

export function getLang() {
  if (localStorage.getItem('mafia_lang')) {
    currentLang = localStorage.getItem('mafia_lang');
  }
  return currentLang;
}

export function t(key) {
  if (!key) return '';
  if (currentLang === 'en') return key;
  return translations[currentLang][key] || key;
}
