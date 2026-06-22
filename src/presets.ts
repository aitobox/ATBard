export interface RecitationPreset {
  id: string;
  title: string;
  author: string;
  category: "classical" | "prose" | "modern" | "english";
  content: string;
  recommendedVoice: string;
  recommendedStyle: string;
  recommendedSpeed: string;
}

export const PRESETS: RecitationPreset[] = [
  {
    id: "jiang-jin-jiu",
    title: "将进酒",
    author: "李白",
    category: "classical",
    recommendedVoice: "Fenrir", // Deep and robust voice
    recommendedStyle: "dramatic", // Ex激越/dramatic
    recommendedSpeed: "medium",
    content: "君不见，黄河之水天上来，奔流到海不复回。\n君不见，高堂明镜悲白发，朝如青丝暮成雪。\n人生得意须尽欢，莫使金樽空对月。\n天生我材必有用，千金散尽还复来。\n烹羊宰牛且为乐，会须一饮三百杯。\n岑夫子，丹丘生，将进酒，杯莫停。\n与君歌一曲，请君为我倾耳听。\n钟鼓馔玉不足贵，但愿长醉不复醒。\n古来圣贤皆寂寞，惟有饮者留其名。\n陈王昔时宴平乐，斗酒十千恣欢谑。\n主人何为言少钱，径须沽取对君酌。\n五花马，千金裘，呼儿将出换美酒，与尔同销万古愁。"
  },
  {
    id: "shui-diao-ge-tou",
    title: "水调歌头 · 明月几时有",
    author: "苏轼",
    category: "classical",
    recommendedVoice: "Charon", // Magnetic and quiet
    recommendedStyle: "elegant", // Elegant文人
    recommendedSpeed: "slow",
    content: "明月几时有？把酒问青天。\n不知天上宫阙，今夕是何年。\n我欲乘风归去，又恐琼楼玉宇，高处不胜寒。\n起舞弄清影，何似在人间。\n\n转朱阁，低绮户，照无眠。\n不应有恨，何事长向别时圆？\n人有悲欢离合，月有阴晴圆缺，此事古难全。\n但愿人长久，千里共婵娟。"
  },
  {
    id: "yu-xiang",
    title: "雨巷",
    author: "戴望舒",
    category: "modern",
    recommendedVoice: "Zephyr", // Soft and gentle
    recommendedStyle: "emotional", // Emotional/melancholic
    recommendedSpeed: "slow",
    content: "撑着油纸伞，独自\n彷徨在悠长、悠长\n又寂寥的雨巷，\n我希望逢着\n一个丁香一样地\n结着愁怨的姑娘。\n\n她是有\n丁香一样的颜色，\n丁香一样的芬芳，\n丁香一样的忧愁，\n在雨中哀怨，\n哀怨又彷徨；\n\n她彷徨在这寂寥的雨巷，\n撑着油纸伞\n像我一样，\n像我一样地\n默默彳亍着，\n冷漠，凄清，又惆怅。"
  },
  {
    id: "he-tang-yue-se",
    title: "荷塘月色 (节选)",
    author: "朱自清",
    category: "prose",
    recommendedVoice: "Aoede", // Bright, lyrical female
    recommendedStyle: "elegant",
    recommendedSpeed: "slow",
    content: "曲曲折折的荷塘上面，弥望的是田田的叶子。\n叶子出水很高，像亭亭的舞女的裙。\n层层的叶子中间，零星地点缀着些白花，有袅娜地开着的，有羞涩地打着朵儿的；正如一粒粒的明珠，又如碧天里的星星，又如刚出浴的美人。\n微风过处，送来缕缕清香，仿佛远处高楼上渺茫的歌声似的。\n这时候叶子与花也有一丝的颤动，像闪电般，霎时传过荷塘的那边去了。"
  },
  {
    id: "sonnet-18",
    title: "Sonnet 18",
    author: "William Shakespeare",
    category: "english",
    recommendedVoice: "Puck", // Expressive male voice
    recommendedStyle: "elegant",
    recommendedSpeed: "medium",
    content: "Shall I compare thee to a summer's day?\nThou art more lovely and more temperate:\nRough winds do shake the darling buds of May,\nAnd summer's lease hath all too short a date;\nSometime too hot the eye of heaven shines,\nAnd often is his gold complexion dimmed;\nAnd every fair from fair sometime declines,\nBy chance or nature's changing course untrimmed;\nBut thy eternal summer shall not fade,\nNor lose possession of that fair thou ow'st;\nNor shall death brag thou wand'rest in his shade,\nWhen in eternal lines to time thou grow'st:\nSo long as men can breathe or eyes can see,\nSo long lives this, and this gives life to thee."
  },
  {
    id: "tagore-furthest",
    title: "世界上最遥远的距离",
    author: "泰戈尔",
    category: "modern",
    recommendedVoice: "Kore", // Deeply emotional preset
    recommendedStyle: "emotional",
    recommendedSpeed: "medium",
    content: "世界上最遥远的距离，不是生与死的距离，而是我站在你面前，你却不知道我爱你。\n\n世界上最遥远的距离，不是我站在你面前你不知道我爱你，而是爱到痴迷，却不能说我爱你。\n\n世界上最遥远的距离，不是我不能说我爱你，而是想你痛彻心脾，却只能深埋心底。\n\n世界上最遥远的距离，不是深埋心底，而是默默相守，却只能在灵魂深处，对你温柔地吐露心声。"
  }
];
