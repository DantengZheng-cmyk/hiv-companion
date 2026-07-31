"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";
type Message = { role: Role; text: string; source?: string };
type Tone = "calm" | "notice" | "urgent";
type SafetyState = { title: string; text: string; tone: Tone };
type Provider = {
  county_city: string;
  district: string;
  provider_name: string;
  service_hours_raw: string;
  emergency_available: string;
  service_type: string;
};

const sources = {
  companion: "陪伴回覆；不含醫療判斷",
  pep: "依據：台灣疾管署 PEP（院所名單 2026/6/24）",
  prep: "依據：台灣疾管署 PrEP（服務名單 2026/7/29）",
  uu: "依據：台灣疾管署 U=U",
  testing: "依據：CDC HIV Testing",
  art: "依據：HIV 治療安全原則；個別用藥依醫囑",
  crisis: "依據：衛福部心理健康資源",
};

const initialMessage: Message = {
  role: "assistant",
  source: sources.companion,
  text: "嗨，我是小澄。你不需要先把事情整理好，也不用一次說完。\n\n你可以直接告訴我：現在最想處理的是一個剛發生的風險、確診或治療上的問題，還是只是很需要有人陪你把話說出來？",
};

const quickPrompts = [
  "保險套破了，約 10 小時前",
  "我想了解 PrEP",
  "病毒量測不到還會傳染嗎？",
  "我剛確診，腦袋一片空白",
];

const exposureTerms = [
  "無套",
  "沒戴套",
  "未戴套",
  "保險套破",
  "套子破",
  "保險套滑",
  "肛交",
  "陰道交",
  "內射",
  "共用針",
  "血液接觸",
  "被針扎",
];

const noRiskTerms = [
  "握手",
  "牽手",
  "擁抱",
  "共餐",
  "一起吃飯",
  "共用餐具",
  "共用馬桶",
  "馬桶",
  "游泳池",
  "蚊子",
  "蚊蟲",
  "咳嗽",
  "打噴嚏",
  "同一間房",
  "親吻",
  "接吻",
];

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function parseHours(text: string): number | null {
  if (text.includes("半小時")) return 0.5;
  if (text.includes("剛剛") || text.includes("剛才")) return 0.5;
  if (text.includes("大前天")) return 72;
  if (text.includes("前天")) return 48;
  if (text.includes("昨天") || text.includes("昨晚")) return 24;
  if (text.includes("上週")) return 168;
  if (/三天半/.test(text)) return 84;
  const halfDay = text.match(/(\d+(?:\.\d+)?)\s*天半/);
  if (halfDay) return (Number(halfDay[1]) + 0.5) * 24;
  const day = text.match(/(\d+(?:\.\d+)?)\s*天/);
  if (day) return Number(day[1]) * 24;
  const hour = text.match(/(\d+(?:\.\d+)?)\s*(?:小時|時)/);
  return hour ? Number(hour[1]) : null;
}

function formatTime(hours: number) {
  if (hours < 1) return "不到 1 小時前";
  if (hours < 24) return `約 ${hours} 小時前`;
  if (hours % 24 === 0) return `約 ${hours / 24} 天前`;
  return `約 ${hours} 小時前`;
}

function parseCsv(csv: string): Provider[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (char === '"' && csv[i + 1] === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (cell || row.length) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = (rows.shift() ?? []).map((item) =>
    item.replace(/^\uFEFF/, ""),
  );
  return rows
    .filter((items) => items.length === headers.length)
    .map(
      (items) =>
        Object.fromEntries(
          headers.map((header, index) => [header, items[index]]),
        ) as Provider,
    );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [pendingExposure, setPendingExposure] = useState(false);
  const [pendingSafety, setPendingSafety] = useState(false);
  const [mode, setMode] = useState("先聽我說");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerQuery, setProviderQuery] = useState("");
  const [safety, setSafety] = useState<SafetyState>({
    title: "你可以慢慢說",
    text: "這裡先陪你理解問題；需要醫療判斷時，會清楚告訴你下一步。",
    tone: "calm",
  });
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/pep-providers.csv`)
      .then((response) => response.text())
      .then((csv) => setProviders(parseCsv(csv)))
      .catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const providerMatches = useMemo(() => {
    const query = providerQuery.trim().replaceAll("台", "臺");
    if (!query) return [];
    return providers
      .filter((provider) =>
        [
          provider.county_city,
          provider.district,
          provider.provider_name,
          provider.service_type,
        ]
          .join(" ")
          .replaceAll("台", "臺")
          .includes(query),
      )
      .sort(
        (a, b) =>
          Number(b.emergency_available === "yes") -
          Number(a.emergency_available === "yes"),
      )
      .slice(0, 6);
  }, [providerQuery, providers]);

  function answer(raw: string): Message {
    const text = raw.trim();
    const normalized = text.toLowerCase();

    if (
      includesAny(normalized, [
        "想死",
        "自殺",
        "不想活",
        "活不下去",
        "傷害自己",
        "結束生命",
      ])
    ) {
      setPendingSafety(true);
      setSafety({
        title: "先保護你的安全",
        text: "如果可能傷害自己，請立刻找人陪同並聯絡緊急服務或前往急診。",
        tone: "urgent",
      });
      return {
        role: "assistant",
        source: sources.crisis,
        text: "我很在意你剛剛說的話，現在先不談 HIV 資訊。\n\n請直接回我：你現在是否已經有傷害自己的計畫、工具或準備時間，或無法確保接下來的安全？可以只回「有／沒有／不確定」。\n\n如果是「有」或「不確定」，請現在移到有人在的地方，請可信任的人陪著你，並撥 119／110 或前往急診；也可以撥衛福部 1925 安心專線。",
      };
    }

    if (pendingSafety) {
      if (
        normalized === "有" ||
        includesAny(normalized, [
          "不確定",
          "有計畫",
          "有工具",
          "現在就要",
          "無法確保",
        ])
      ) {
        return {
          role: "assistant",
          source: sources.crisis,
          text: "謝謝你直接告訴我。現在請先不要獨處，把可能傷害自己的物品移遠或交給身邊的人，請對方陪你撥 119／110、帶你到急診，或撥 1925 安心專線。",
        };
      }
      if (
        normalized === "沒有" ||
        includesAny(normalized, ["目前安全", "沒有計畫", "不會傷害自己"])
      ) {
        setPendingSafety(false);
        return {
          role: "assistant",
          source: sources.crisis,
          text: "謝謝你告訴我目前沒有立即計畫。這仍然值得有人陪你，不必等到更危險才求助。\n\n接下來一小時先不要獨處，移開可能讓你受傷的物品，並傳訊息給一位可信任的人：「我現在狀況很差，想請你陪我一下。」安全狀況若改變，請立即撥 119／110 或去急診。",
        };
      }
      return {
        role: "assistant",
        source: sources.crisis,
        text: "我想確認清楚，避免誤解你：請只回「有立即計畫／目前沒有／不確定」其中一個。",
      };
    }

    if (
      includesAny(normalized, [
        "被強迫",
        "性侵",
        "不是自願",
        "被下藥",
        "被逼",
      ])
    ) {
      setSafety({
        title: "今天需要醫療協助",
        text: "先確保人身安全；若可能仍在 72 小時內，請儘快前往急診評估。",
        tone: "urgent",
      });
      return {
        role: "assistant",
        source: sources.pep,
        text: "這不是你的錯。現在先把你的安全和身體照顧放在第一位。\n\n若事件可能在 72 小時內，請今天就到急診或可評估 PEP 的醫療院所；越早越好。你不需要先把所有細節說清楚，只要說：「我發生非自願的性接觸，需要醫療與 PEP 評估。」",
      };
    }

    if (
      includesAny(normalized, [
        "喘不過氣",
        "呼吸困難",
        "意識不清",
        "昏倒",
        "喉嚨腫",
        "嘴唇腫",
        "黃疸",
        "持續嘔吐",
      ])
    ) {
      setSafety({
        title: "需要立即就醫",
        text: "嚴重症狀請停止聊天，撥 119 或前往急診。",
        tone: "urgent",
      });
      return {
        role: "assistant",
        source: sources.art,
        text: "你描述的症狀可能需要立即處理。請先停止聊天並撥 119 或前往急診；若身邊有人，請請他陪同。帶上目前所有藥品或藥袋。",
      };
    }

    if (
      includesAny(normalized, noRiskTerms) &&
      includesAny(normalized, ["hiv", "愛滋", "感染", "傳染"])
    ) {
      setPendingExposure(false);
      setSafety({
        title: "這不是 HIV 傳播途徑",
        text: "日常接觸不會傳播 HIV；若還有其他接觸情況，可以再說明。",
        tone: "calm",
      });
      return {
        role: "assistant",
        source: "依據：台灣疾管署 HIV 傳播途徑衛教",
        text: "就你描述的這種日常接觸，不會傳播 HIV。握手、擁抱、共餐、共用馬桶、游泳池、咳嗽、蚊蟲叮咬或一般親吻，都不是 HIV 傳播途徑。\n\n如果其實還有無套肛交／陰道交、共用針具，或血液接觸到黏膜與傷口，可以再告訴我；那會是不同的評估。",
      };
    }

    if (
      includesAny(normalized, ["u=u", "測不到", "病毒量抑制"]) &&
      !includesAny(normalized, ["昨天", "小時前", "天前"])
    ) {
      setSafety({
        title: "U=U",
        text: "維持病毒量低於 200 copies/mL 時，不會透過性行為傳播 HIV。",
        tone: "calm",
      });
      if (includesAny(normalized, ["捐血", "共用針", "哺乳"])) {
        return {
          role: "assistant",
          source: sources.uu,
          text: "U=U 的證據結論是：穩定接受治療並維持病毒量低於 200 copies/mL 時，不會透過性行為傳播 HIV。\n\n這個結論不能直接延伸到捐血、共用針具或哺乳。依台灣現行規範，HIV 感染者不能捐血，共用針具也仍應避免。",
        };
      }
      return {
        role: "assistant",
        source: sources.uu,
        text: "是的。穩定接受治療並維持病毒量低於 200 copies/mL 時，不會透過性行為傳播 HIV。這不是「風險很低」，而是不會透過性行為傳播。\n\n保險套仍可預防其他性傳染病與非預期懷孕，但不是達成 U=U 後防止 HIV 性傳播的必要條件。",
      };
    }

    if (includesAny(normalized, ["prep", "暴露前", "2-1-1"])) {
      setSafety({
        title: "PrEP 需先評估",
        text: "開始前需確認 HIV 陰性，並由醫師評估檢驗與使用方式。",
        tone: "notice",
      });
      return {
        role: "assistant",
        source: sources.prep,
        text: includesAny(normalized, ["2-1-1", "怎麼吃", "劑量"])
          ? "PrEP 是暴露前預防，但我不會替個人決定 2-1-1 或每日服用方式。並非每個人都適合，開始前需要確認 HIV 陰性，並評估近期暴露、B 型肝炎、腎功能與其他用藥。\n\n你可以直接問醫師：「依我的性行為型態與健康狀況，哪一種 PrEP 方式較適合？」"
          : "PrEP 是 HIV 暴露前預防用藥，適合未感染 HIV、但未來可能持續有暴露機會的人。開始前需先確認沒有 HIV 感染，由醫師評估檢驗與使用方式；保護力不是 100%，也不能預防其他性傳染病。",
      };
    }

    if (
      includesAny(normalized, [
        "空窗期",
        "多久驗",
        "什麼時候驗",
        "檢驗",
        "篩檢",
      ])
    ) {
      setSafety({
        title: "檢驗有空窗期",
        text: "暴露後立刻陰性不能排除感染；請依檢驗種類與用藥安排追蹤。",
        tone: "notice",
      });
      return {
        role: "assistant",
        source: sources.testing,
        text: "暴露後立刻驗到陰性，不能排除這次感染。常見偵測範圍為：實驗室抗原／抗體檢驗約 18–45 天、抗體檢驗約 23–90 天、NAT 約 10–33 天。\n\n實際追蹤時間要依檢驗種類、暴露日期，以及是否使用 PEP／PrEP 安排；抗病毒藥物可能影響偵測時間。",
      };
    }

    if (
      includesAny(normalized, [
        "忘記吃藥",
        "漏吃",
        "副作用",
        "想停藥",
        "吃兩顆",
        "加倍",
      ])
    ) {
      setSafety({
        title: "用藥安全",
        text: "不要自行停藥、換藥或加倍補吃；嚴重症狀請立即就醫。",
        tone: "notice",
      });
      return {
        role: "assistant",
        source: sources.art,
        text: "先不要自行停藥、換藥或加倍補吃。不同 HIV 藥物的漏藥處理可能不同，請依藥袋指示，或直接詢問原照護團隊／藥師。\n\n可以先準備：藥名、原定服藥時間、漏了多久、是否已補吃，以及目前症狀；這會讓醫療人員更快判斷。",
      };
    }

    const hours = parseHours(normalized);
    const explicitExposure = includesAny(normalized, exposureTerms);
    const exposureFollowup = pendingExposure && hours !== null;

    if (explicitExposure || exposureFollowup) {
      setPendingExposure(true);
      if (hours === null) {
        setSafety({
          title: "PEP 有時間性",
          text: "請先確認發生時間；若可能仍在 72 小時內，今天就醫評估。",
          tone: "notice",
        });
        return {
          role: "assistant",
          source: sources.pep,
          text: "我先不替你算感染機率，因為現在最重要的是不要錯過能處理的時間。\n\n請告訴我大約是幾小時或幾天前；如果不確定、但有可能仍在 72 小時內，請今天就到感染科、急診或 PEP 服務院所評估。台灣疾管署建議 72 小時內開始，24 小時內最佳。",
        };
      }
      if (hours <= 72) {
        setSafety({
          title: "今天就醫評估",
          text: "仍在 PEP 評估時間窗內；越早開始越好，24 小時內最佳。",
          tone: "urgent",
        });
        return {
          role: "assistant",
          source: sources.pep,
          text: `你描述的時間約在 ${formatTime(hours)}，仍在 PEP 評估時間窗內。現在最重要的下一步是今天就醫，越早越好；24 小時內最佳，不要等待檢驗結果或聊天結論才出發。\n\n到院可以直接說：「我可能有 HIV 暴露，事情約在 ${formatTime(hours)}，想評估 PEP。」是否需要用藥仍由醫療人員依接觸方式、對方病毒量／狀態與你的身體狀況判斷。`,
        };
      }
      setSafety({
        title: "下一步是檢驗與追蹤",
        text: "超過 72 小時不代表一定感染；請安排 HIV／性傳染病檢驗。",
        tone: "notice",
      });
      return {
        role: "assistant",
        source: sources.pep,
        text: "已超過 72 小時，但這不代表一定感染，也不代表不需要處理。\n\n現行指引通常不建議在超過 72 小時後才開始 PEP；請儘快找醫療人員安排 HIV 與其他性傳染病檢驗，並依檢驗種類與是否曾使用 PEP／PrEP 訂追蹤時間。",
      };
    }

    if (includesAny(normalized, ["確診", "陽性", "感染 hiv"])) {
      setSafety({
        title: "先處理今天",
        text: "確認 HIV 照護回診；你不需要現在就告訴所有人。",
        tone: "calm",
      });
      return {
        role: "assistant",
        source: sources.uu,
        text: "剛知道結果時腦袋一片空白很常見。你今天不用把一輩子都想完。\n\n先做兩件事：確認感染科或 HIV 照護回診，以及找一個你信任、能陪你的人。現在的 HIV 可以透過持續治療控制；你也不需要立刻告訴所有人。此刻最壓著你的是健康、關係，還是害怕被別人知道？",
      };
    }

    if (mode === "幫我整理") {
      return {
        role: "assistant",
        source: sources.companion,
        text: `我先幫你整理成三格：\n\n1. 發生了什麼：${text}\n2. 現在最擔心什麼：這部分還需要你補一句\n3. 下一步：先確認是否有時間性或嚴重症狀，再決定要衛教、就醫或只是繼續說\n\n你現在最怕發生的結果是什麼？`,
      };
    }

    return {
      role: "assistant",
      source: sources.companion,
      text: "我有聽到你現在心裡卡著一件很難自己消化的事。你不需要一次說得完整。\n\n如果可以，我想先陪你抓一個重點：你現在最需要的是有人聽你說、幫你整理，還是確認一個 HIV／治療相關問題？",
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;
    const userMessage: Message = { role: "user", text };
    const reply = answer(text);
    setMessages((current) => [...current, userMessage, reply]);
    setInput("");
  }

  async function copySummary() {
    const userMessages = messages
      .filter((message) => message.role === "user")
      .slice(-5)
      .map((message) => `- ${message.text}`)
      .join("\n");
    const summary = `給醫療人員的討論摘要\n\n近期描述：\n${userMessages || "（尚未輸入）"}\n\n目前系統提醒：${safety.title}—${safety.text}\n\n此摘要由衛教工具整理，不能取代病史詢問與醫療判斷。`;
    await navigator.clipboard.writeText(summary);
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="回到頁首">
          <span className="brand-mark" aria-hidden="true">
            澄
          </span>
          <span>
            <strong>小澄</strong>
            <small>HIV 健康陪伴</small>
          </span>
        </a>
        <div className="header-note">
          <span className="status-dot" aria-hidden="true" />
          衛教測試版・不取代醫療診斷
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">一個可以慢慢說的地方</p>
          <h1>
            把擔心說出來，
            <br />
            我們先處理<span>最重要的一步</span>。
          </h1>
          <p className="hero-copy">
            提供台灣情境的 HIV、PEP、PrEP、U=U、檢驗與治療衛教，也可以陪你整理情緒和回診問題。
          </p>
        </div>
        <div className="privacy-card">
          <strong>隱私提醒</strong>
          <p>
            本頁不要求登入，也不會在本站保存對話。請不要輸入姓名、身分證字號、電話或住址等不必要資料。
          </p>
        </div>
      </section>

      <section className="app-shell">
        <div className="chat-panel">
          <div className={`safety-strip ${safety.tone}`}>
            <strong>{safety.title}</strong>
            <span>{safety.text}</span>
          </div>

          <div className="mode-row" aria-label="選擇陪伴方式">
            <span>這一刻希望我：</span>
            {["先聽我說", "幫我整理", "給我衛教"].map((item) => (
              <button
                className={mode === item ? "active" : ""}
                key={item}
                onClick={() => setMode(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>

          <div className="chat-log" aria-live="polite">
            {messages.map((message, index) => (
              <article className={`message ${message.role}`} key={index}>
                <div className="message-meta">
                  {message.role === "assistant" ? "小澄" : "你"}
                </div>
                <div className="bubble">
                  {message.text.split("\n").map((line, lineIndex) => (
                    <span key={lineIndex}>
                      {line}
                      <br />
                    </span>
                  ))}
                </div>
                {message.source && (
                  <div className="source-tag">{message.source}</div>
                )}
              </article>
            ))}
            <div ref={chatEnd} />
          </div>

          <div className="prompt-row">
            {quickPrompts.map((prompt) => (
              <button key={prompt} onClick={() => setInput(prompt)} type="button">
                {prompt}
              </button>
            ))}
          </div>

          <form className="composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="message">
              輸入想說的話
            </label>
            <textarea
              id="message"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="不用整理好，直接從你最在意的地方開始……"
              rows={2}
              value={input}
            />
            <button className="send-button" type="submit">
              送出
            </button>
          </form>
          <p className="composer-hint">Enter 送出・Shift + Enter 換行</p>
        </div>

        <aside className="side-panel">
          <section className="side-card action-card">
            <p className="card-kicker">若可能在 72 小時內</p>
            <h2>PEP 越早評估越好</h2>
            <p>
              台灣疾管署建議暴露後 72 小時內開始，24 小時內最佳；是否需要用藥由醫療人員判斷。
            </p>
            <details>
              <summary>查詢 PEP 服務院所</summary>
              <div className="provider-search">
                <input
                  aria-label="縣市、行政區或院所名稱"
                  onChange={(event) => setProviderQuery(event.target.value)}
                  placeholder="例如：臺北市、板橋、成大"
                  value={providerQuery}
                />
                {providerQuery && !providerMatches.length && (
                  <p className="empty-state">
                    目前名單未找到結果。若接近 72 小時，請勿等待搜尋結果，可直接詢問急診或感染科。
                  </p>
                )}
                {providerMatches.map((provider) => (
                  <article className="provider-item" key={provider.provider_name}>
                    <strong>{provider.provider_name}</strong>
                    <span>
                      {provider.county_city} {provider.district}・
                      {provider.emergency_available === "yes"
                        ? "表列有急診"
                        : provider.service_type}
                    </span>
                    <small>{provider.service_hours_raw}</small>
                  </article>
                ))}
              </div>
            </details>
          </section>

          <section className="side-card">
            <p className="card-kicker">回診準備</p>
            <h2>把剛才的重點帶給醫療人員</h2>
            <p>只整理你在本次頁面輸入的內容，不會自動傳送給任何人。</p>
            <button className="secondary-button" onClick={copySummary} type="button">
              複製討論摘要
            </button>
            <button
              className="text-button"
              onClick={() => {
                setMessages([initialMessage]);
                setPendingExposure(false);
                setPendingSafety(false);
              }}
              type="button"
            >
              清除目前對話
            </button>
          </section>

          <details className="source-card">
            <summary>醫學依據與使用界線</summary>
            <div>
              <p>
                小澄是 AI 合成陪伴角色，不是真實病友、醫師、心理師或藥師。
              </p>
              <a
                href="https://www.cdc.gov.tw/Category/MPage/uo89XT3izngK6IY0wv8BNg"
                rel="noreferrer"
                target="_blank"
              >
                台灣疾管署：PEP
              </a>
              <a
                href="https://www.cdc.gov.tw/Category/MPage/tXBKgpeVZ9l9929TEdZGJw"
                rel="noreferrer"
                target="_blank"
              >
                台灣疾管署：PrEP
              </a>
              <a
                href="https://www.cdc.gov.tw/Bulletin/Detail/m-tLXNRwe7tFFBI4ZRV96g?typeid=48"
                rel="noreferrer"
                target="_blank"
              >
                台灣疾管署：U=U
              </a>
              <a
                href="https://www.cdc.gov/hivpartners/php/hiv-testing/index.html"
                rel="noreferrer"
                target="_blank"
              >
                CDC：HIV Testing
              </a>
            </div>
          </details>
        </aside>
      </section>

      <footer>
        <span>小澄 HIV 健康陪伴・測試版</span>
        <span>資料最近檢視：2026/7/31</span>
      </footer>
    </main>
  );
}
