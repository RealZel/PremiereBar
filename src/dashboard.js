const WHITE = "#FFFFFFFF";
const GRAY = "#BBBBBBFF";
const DARK = "#252525FF";
const WIDTH = 148;

function text(id, value, x, y, font = "tiny", color = WHITE, align = "top_left") {
  return { id, type: "text", display: "back", align, x, y, font, color, text: value, z_index: 2 };
}

function bar(id, y, height, color) {
  return { id, type: "rectangle", display: "back", align: "top_left", x: 0, y, width: WIDTH, height,
    fill: "solid", fill_colors: [color], border_width: 0, z_index: 1 };
}

const CYRILLIC = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
const LATIN = "a b v g d e yo zh z i y k l m n o p r s t u f kh ts ch sh shch _ y _ e yu ya".split(" ");

function titleText(value, fallback) {
  const ascii = value.toLowerCase()
    .replace(/[а-яё]/g, (letter) => LATIN[CYRILLIC.indexOf(letter)])
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/_/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return ascii ? ascii.toUpperCase() : fallback;
}

function number(value) {
  return value == null ? "--" : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function renderDashboard({ show, video, status, demo, hour, goal, index, footer }) {
  const title = video ? titleText(video.title, "VIDEO " + (index + 1)) :
    show ? "NO PUBLIC VIDEOS" : status === "CONNECTING" ? "OPENING CINEMA" : "WAITING FOR DATA";
  const source = demo ? "SAMPLE CHANNEL" : show ? "YouTube / " + titleText(show.title, "CHANNEL") : "YouTube Data API";
  const hourLabel = hour == null ? "--" : (hour > 0 ? "+" : "") + number(hour);
  const rightFooter = show?.videos.length ? (index + 1) + "/" + show.videos.length : "-";

  return [
    bar("back-header", 0, 13, DARK),
    bar("back-rule", 40, 1, DARK),
    bar("back-footer", 70, 10, DARK),
    text("app-title", "PREMIERE BAR", 5, 3, "small"),
    text("status", status, 143, 3, "tiny", WHITE, "top_right"),
    { ...text("video-title", title, 5, 16, "normal"), width: 138, scroll_rate: 900, scroll_start_delay: 1200 },
    { ...text("source", source, 5, 33, "tiny", GRAY), width: 138 },
    text("views-label", "VIEWS", 5, 43, "tiny", GRAY),
    text("views", number(video?.views), 143, 43, "tiny", WHITE, "top_right"),
    text("change-label", "CHANGE ~1H", 5, 52, "tiny", GRAY),
    text("change", hourLabel, 143, 52, "tiny", WHITE, "top_right"),
    text("subscribers-label", "SUBSCRIBERS", 5, 61, "tiny", GRAY),
    text("subscribers", number(show?.subscribers), 143, 61, "tiny", WHITE, "top_right"),
    text("hint", footer || "GOAL " + number(goal) + " VIEWS", 5, 71),
    text("index", rightFooter, 143, 71, "tiny", WHITE, "top_right"),
  ];
}
