// Shared application state and configuration constants.
const TABS = {
    over: { n: "📊 Overview" },
    money: { n: "💰 Money", num: "Amount ₹", txt: "Note (allowance, toy…)", sign: ["Add", "Spend"] },
    stars: { n: "⭐ Stars", num: "Stars", txt: "Reason", sign: ["Earn", "Lose"] },
    shop: { n: "🛍 Shopping", num: "Price ₹", txt: "Item" },
    classes: { n: "📚 Classes", txt: "Class & activity / homework" },
    health: { n: "🌡 Health", num: "Temp °F", txt: "Symptoms / medicine / note" },
    rewards: { n: "🎁 Rewards" }, masters: { n: "🗂 Masters" }, people: { n: "👥 People" }, expenses: { n: "💳 Expenses" }, profile: { n: "👤 Profile" }
};
const ROLES = { parent: "Parent", teacher: "Teacher / caregiver", child: "Member (own view)", pending: "No access" };
const KMAP = { money: "category", stars: "reason", shop: "item", classes: "class", health: "medicine" };
const MK = { class: ["Classes", ""], item: ["Shopping items", "Default price ₹"], reason: ["Star reasons", "Stars (use − to deduct)"], reward: ["Star rewards (redeem)", "Cost in stars"], rate: ["Star → money rate", ""], category: ["Money categories", ""], medicine: ["Medicines", ""] };
const ALLOW = { admin: ["over", "money", "stars", "rewards", "shop", "classes", "health", "masters", "people", "expenses", "profile"], parent: ["over", "money", "stars", "rewards", "shop", "classes", "health", "expenses", "profile"], teacher: ["classes", "health", "profile"], child: ["money", "stars", "rewards", "profile"], pending: [] };
let openM = {}, sb, me, prof, masters = [], kids = [], items = [], profs = [], tab = "", kid = null, busy = false;
let expenses = [], expenseCategories = [], expenseSubcategories = [], savedExpenseFilters = [], expenseLoadError = "";\nlet expenseImportBatches = [], expenseBatchLoadError = "";
