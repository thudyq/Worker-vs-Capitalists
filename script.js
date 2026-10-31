const rules = { capitalists: 3, workers: 10, capital: 500, fixedCost: 40, livingCost: 25, output: 30, rounds: 5 };
const $ = (selector) => document.querySelector(selector);
const integer = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const money = (value) => `${value.toLocaleString("zh-CN")} 元`;
const isInteger = (value, min = 1) => Number.isSafeInteger(value) && value >= min;
let game;

function capitalists() { return game.people.filter((p) => p.role === "capitalist"); }
function workers() { return game.people.filter((p) => p.role === "worker" && p.alive); }
function player() { return game.people.find((p) => p.human); }
function person(id) { return game.people.find((p) => p.id === id); }
function label(p) { return p.name + (p.human ? "（你）" : ""); }

function showNotice(title, content, button = "继续") {
    $("#notice-title").textContent = title;
    $("#notice-content").innerHTML = content;
    $("#notice-close").textContent = button;
    if (!$("#notice").open) $("#notice").showModal();
}

// 权重随机让电脑保留偏好，同时避免每次作出相同选择。
function weighted(items, weight) {
    let value = Math.random() * items.reduce((sum, item) => sum + weight(item), 0);
    for (const item of items) {
        value -= weight(item);
        if (value < 0) return item;
    }
    return items.at(-1);
}

function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = integer(0, i);
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

function start(role) {
    game = { round: 0, people: [], history: [], finished: false };
    for (let i = 0; i < rules.capitalists; i++) {
        game.people.push({ id: `c${i}`, name: `资本家 ${String.fromCharCode(65 + i)}`, role: "capitalist", assets: rules.capital, alive: true, human: role === "capitalist" && i === 0 });
    }
    for (let i = 0; i < rules.workers; i++) {
        game.people.push({ id: `w${i}`, name: `工人 ${i + 1}`, role: "worker", assets: 0, alive: true, human: role === "worker" && i === 0 });
    }
    $("#start").hidden = true;
    $("#game").hidden = false;
    $("#restart").hidden = false;
    nextRound();
}

function nextRound() {
    game.round++;
    game.workerCount = workers().length;
    game.roundWorkers = workers();
    game.companies = capitalists();
    game.notes = [];
    for (const p of game.people) {
        p.opening = p.assets;
        p.application = null;
        p.employer = null;
        p.wage = 0;
        p.purchase = null;
    }
    for (const c of game.companies) {
        c.hired = [];
        c.output = 0;
        c.price = null;
        c.sales = null;
        c.buyers = 0;
        c.offer = c.human ? null : computerOffer(c);
    }
    game.phase = player().role === "capitalist" ? "recruit" : "apply";
    render();
}

function computerOffer(c) {
    const available = c.assets - rules.fixedCost;
    if (available < 1) return { count: 0, ceiling: 1 };
    const ceiling = Math.min(available, integer(43, 65));
    const target = Math.ceil(game.workerCount / game.companies.length) + integer(-1, 1);
    return { count: Math.min(Math.max(1, target), Math.floor(available / ceiling)), ceiling };
}

function computerApplication(w) {
    const jobs = game.companies.filter((c) => c.offer.count > 0);
    if (!jobs.length) return null;
    const c = weighted(jobs, (item) => item.offer.count * item.offer.ceiling);
    const ceiling = c.offer.ceiling;
    const target = Math.max(1, rules.livingCost + integer(5, 12) - w.assets);
    const low = Math.min(ceiling, Math.max(target, Math.floor(ceiling * 0.65)));
    const high = Math.max(low, Math.floor(ceiling * 0.96));
    return { employer: c.id, bid: integer(low, high) };
}

// 先打乱再排序，保证同价工人的录用机会相同。
function hire(application) {
    for (const w of game.roundWorkers) {
        w.application = w.human ? application : computerApplication(w);
    }
    for (const c of game.companies) {
        const applicants = shuffle(game.roundWorkers.filter((w) => w.application?.employer === c.id));
        applicants.sort((a, b) => a.application.bid - b.application.bid);
        c.hired = applicants.slice(0, c.offer.count);
        for (const w of c.hired) {
            w.employer = c.id;
            w.wage = w.application.bid;
            w.assets += w.wage;
            c.assets -= w.wage;
        }
        c.output = c.hired.length * rules.output;
        c.assets -= rules.fixedCost;
    }
    // 电脑定价不读取玩家尚未提交的价格。
    for (const c of game.companies) {
        if (!c.human) c.pendingPrice = computerPrice(c);
    }
    game.phase = "price";
    render();
    const me = player();
    if (me.role === "capitalist") {
        const applicants = game.roundWorkers.filter((w) => w.application?.employer === me.id).sort((a, b) => a.application.bid - b.application.bid);
        const wages = me.hired.reduce((sum, w) => sum + w.wage, 0);
        const rows = applicants.map((w) => `<tr><th>${label(w)}</th><td>${money(w.application.bid)}</td><td>${w.employer === me.id ? money(w.wage) : "—"}</td><td>${w.employer === me.id ? "已录用" : "未录用"}</td></tr>`).join("");
        showNotice("你的招聘结果", `<p>${applicants.length}人申请，计划招聘${me.offer.count}人。</p>${rows ? `<div class="table-wrap"><table><thead><tr><th>申请工人</th><th>报价</th><th>实发工资</th><th>结果</th></tr></thead><tbody>${rows}</tbody></table></div>` : "<p>没有工人申请你的企业。</p>"}<p class="notice-total">录用 ${me.hired.length} 人 · 工资合计 ${money(wages)}</p><p>已生产${me.output}件，工资与${rules.fixedCost}元固定开支已扣除，剩余${money(me.assets)}。</p>`, "继续定价");
    } else if (me.alive) {
        showNotice(me.employer ? "你被录用了" : "本轮未被录用", me.employer ? `<p>${person(me.employer).name}录用了你。</p><p class="notice-total">工资 +${money(me.wage)}，已到账</p><p>当前资产${money(me.assets)}。</p>` : `<p>${me.application ? `你向${person(me.application.employer).name}报价${money(me.application.bid)}，未被录用，本轮不能重新申请。` : "本轮没有招聘岗位。"}</p><p>当前资产${money(me.assets)}，仍需支付生活费并购买产品。</p>`, "查看定价");
    }
}

function computerPrice(c) {
    if (!c.output) return 1;
    const wages = c.hired.reduce((sum, w) => sum + w.wage, 0);
    const costPrice = (wages + rules.fixedCost) / (c.output / game.companies.length);
    const budgets = game.roundWorkers.map((w) => Math.max(0, w.assets - rules.livingCost)).sort((a, b) => a - b);
    const typicalBudget = budgets[Math.floor(budgets.length / 2)] || 1;
    return Math.max(1, Math.min(typicalBudget, Math.round(costPrice * integer(90, 135) / 100)));
}

function beginConsumption(price) {
    const me = player();
    const wasAlive = me.alive;
    for (const c of game.companies) c.price = c.human ? price : c.pendingPrice;
    for (const w of game.roundWorkers) {
        if (w.assets < rules.livingCost) {
            w.assets = 0;
            w.alive = false;
            w.reason = "生活费不足";
        } else {
            w.assets -= rules.livingCost;
            if (!affordable(w).length) {
                w.alive = false;
                w.reason = "买不起产品";
            }
        }
    }
    // 购买结果统一揭晓，不让电脑读取玩家的购买选择。
    for (const w of game.roundWorkers.filter((w) => w.alive && !w.human)) {
        w.pendingPurchase = weighted(affordable(w), (c) => 1 / (c.price * c.price)).id;
    }
    game.phase = "consume";
    render();
    if (me.role === "worker" && wasAlive && !me.alive) {
        showNotice("你已被淘汰", `<p class="notice-warning">${me.reason === "生活费不足" ? "资产不足以支付生活费。" : "扣除生活费后，买不起任何有产量企业的产品。"}</p><p>剩余资产${money(me.assets)}，你可以继续观看。</p>`, "继续观看");
    } else if (wasAlive) {
        const prices = game.companies.filter((c) => c.output > 0).map((c) => `<li>${label(c)}：每件${money(c.price)}</li>`).join("");
        showNotice("本轮售价已公布", `${prices ? `<ul>${prices}</ul>` : "<p>本轮没有企业生产产品。</p>"}${me.role === "worker" ? `<p class="notice-total">生活费 −${rules.livingCost} 元 · 剩余 ${money(me.assets)}</p>` : "<p>工人即将统一作出购买选择。</p>"}`, me.role === "worker" ? "选择产品" : "进入消费");
    }
}

function affordable(w) {
    return game.companies.filter((c) => c.output > 0 && c.price <= w.assets);
}

function settle(purchase) {
    const me = player();
    const wasCapitalist = me.role === "capitalist";
    for (const w of game.roundWorkers) {
        if (!w.alive) {
            game.notes.push(`${label(w)}：${w.reason}，淘汰。`);
            continue;
        }
        const c = person(w.human ? purchase : w.pendingPurchase);
        w.assets -= c.price;
        w.purchase = c.id;
        c.buyers++;
    }
    for (const c of game.companies) {
        c.sales = Math.round(c.output * c.buyers / game.workerCount);
        c.assets += c.sales * c.price;
        if (c.assets < rules.fixedCost) {
            c.role = "worker";
            game.notes.push(`${label(c)}：资产低于40元，降为工人。`);
        }
    }
    if (!capitalists().length) game.endReason = "所有资本家均已降为工人。";
    else if (!workers().length) game.endReason = "全部工人已淘汰。";
    else if (game.round === rules.rounds) game.endReason = "五轮结束。";
    game.finished = Boolean(game.endReason);
    game.history.unshift({ round: game.round, assets: player().assets, change: player().assets - player().opening });
    game.phase = "result";
    render();
    const change = me.assets - me.opening;
    let content = `<p class="notice-total">本轮资产 ${change >= 0 ? "+" : "−"}${money(Math.abs(change))} · 当前 ${money(me.assets)}</p>`;
    if (wasCapitalist) {
        const customers = game.roundWorkers.filter((w) => w.purchase === me.id);
        content += `<p>${customers.length ? `${customers.map(label).join("、")}选择了你的产品。` : "没有工人购买你的产品。"}</p><p>销量${me.sales}件，销售收入${money(me.sales * me.price)}。</p>`;
        if (me.role === "worker") content += '<p class="notice-warning">资产低于40元，你已降为工人，剩余资产保留。</p>' + (game.finished ? "" : "<p>下一轮开始求职。</p>");
    } else if (me.purchase) {
        content += `<p>已向${person(me.purchase).name}支付${money(person(me.purchase).price)}，购得1件产品。</p>`;
    } else if (!me.alive) content += "<p>你已淘汰，不参与最终排名。</p>";
    if (game.finished) {
        content += `<p>${game.endReason}</p>`;
        for (const role of ["capitalist", "worker"]) {
            const group = game.people.filter((p) => p.role === role && p.alive);
            const best = Math.max(...group.map((p) => p.assets));
            content += `<p>${role === "capitalist" ? "资本家" : "工人"}第一名：${group.length ? group.filter((p) => p.assets === best).map(label).join("、") + `（${money(best)}）` : "无"}</p>`;
        }
    }
    showNotice(game.finished ? "游戏结束" : wasCapitalist && me.role === "worker" ? "你已降为工人" : "本轮结算", content, "查看结算");
}

function submit(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const me = player();
    $("#error").textContent = "";
    if (game.phase === "recruit") {
        const count = Number(values.get("count"));
        const ceiling = Number(values.get("ceiling"));
        if (!isInteger(count, 0) || !isInteger(ceiling) || count * ceiling > me.assets - rules.fixedCost) {
            $("#error").textContent = "人数须为非负整数，工资须为正整数，并预留40元固定开支。";
            return;
        }
        me.offer = { count, ceiling };
        game.phase = "apply";
        render();
    } else if (game.phase === "apply") {
        let application = null;
        if (me.role === "worker" && me.alive && game.companies.some((c) => c.offer.count > 0)) {
            const c = person(values.get("employer"));
            const bid = Number(values.get("bid"));
            if (!c || !game.companies.includes(c) || !c.offer.count || !isInteger(bid) || bid > c.offer.ceiling) {
                $("#error").textContent = "请选择有岗位的企业，报价须为正整数且不超过工资上限。";
                return;
            }
            application = { employer: c.id, bid };
        }
        hire(application);
    } else if (game.phase === "price") {
        const price = Number(values.get("price"));
        if (me.role === "capitalist" && !isInteger(price)) {
            $("#error").textContent = "售价须为正整数。";
            return;
        }
        beginConsumption(price);
    } else if (game.phase === "consume") {
        const purchase = values.get("purchase");
        if (me.role === "worker" && me.alive && !affordable(me).some((c) => c.id === purchase)) {
            $("#error").textContent = "必须选择有产品且买得起的企业。";
            return;
        }
        settle(purchase);
    } else if (game.phase === "result" && !game.finished) nextRound();
}

function render() {
    const me = player();
    const phase = game.phase;
    const revealed = ["price", "consume", "result"].includes(phase);
    const priced = ["consume", "result"].includes(phase);
    const buying = me.role === "worker" && me.alive;
    $("#round").textContent = `第 ${game.round} / ${rules.rounds} 轮`;
    $("#player").textContent = `${label(me)} · ${me.alive ? (me.role === "capitalist" ? "资本家" : "工人") : "已淘汰"} · ${money(me.assets)}`;
    const phases = ["recruit", "apply", "price", "consume", "result"];
    $("#steps").innerHTML = ["招聘", "申请", "定价", "消费", "结算"].map((name, i) => `<span class="${phases[i] === phase ? "current" : ""}">${i + 1}. ${name}</span>`).join("");
    $("#companies").innerHTML = game.companies.map((c) => {
        const offer = phase === "recruit" && !c.human ? null : c.offer;
        return `<tr class="${c.human ? "you" : ""}"><th>${label(c)}${c.role === "worker" ? " · 已降级" : ""}</th><td>${money(c.assets)}</td><td>${offer ? `${offer.count} 人 / ${offer.ceiling} 元` : "待公布"}</td><td>${revealed ? c.hired.length : "—"}</td><td>${revealed ? c.output : "—"}</td><td>${priced ? money(c.price) : "待公布"}</td><td>${phase === "result" ? c.sales : "—"}</td></tr>`;
    }).join("");
    $("#workers").innerHTML = game.people.filter((w) => w.role === "worker").map((w) => {
        const currentWorker = game.roundWorkers.includes(w);
        const status = !w.alive ? `已淘汰 · ${w.reason}` : !currentWorker ? "下轮求职" : revealed ? (w.employer ? "已就业" : "失业") : "待招聘";
        return `<tr class="${w.human ? "you" : ""}"><th>${label(w)}</th><td>${money(w.assets)}</td><td>${revealed && w.employer ? person(w.employer).name : "—"}</td><td>${revealed && w.application ? `${w.application.bid} / ${w.wage} 元` : "—"}</td><td>${w.purchase ? person(w.purchase).name : "—"}</td><td>${status}</td></tr>`;
    }).join("");
    let title, hint, fields = "", button;
    if (phase === "recruit") {
        title = "发布招聘";
        hint = `可承诺工资的资金：${money(me.assets - rules.fixedCost)}。提交后统一公布招聘条件。`;
        fields = '<label>招聘人数<input name="count" type="number" min="0" step="1" value="3" required></label><label>工资上限<input name="ceiling" type="number" min="1" step="1" value="50" required></label>';
        button = "公布招聘";
    } else if (phase === "apply") {
        title = "工人申请";
        const jobs = game.companies.filter((c) => c.offer.count > 0);
        hint = buying ? "选择一家企业并申报工资。低价优先录用，落选不可重投。" : "统一提交报价后，由低到高录用，同价随机。";
        if (buying && jobs.length) {
            fields = `<label>申请企业<select name="employer">${jobs.map((c) => `<option value="${c.id}">${c.name} · ${c.offer.count}个岗位 · 上限${c.offer.ceiling}元</option>`).join("")}</select></label><label>工资报价<input name="bid" type="number" min="1" step="1" value="${Math.min(38, jobs[0].offer.ceiling)}" required></label>`;
        } else if (buying) hint = "本轮没有招聘岗位，你将失业。";
        button = buying && jobs.length ? "提交申请" : "完成招聘";
    } else if (phase === "price") {
        title = "产品定价";
        hint = me.role === "capitalist" ? `已生产${me.output}件，并支付工资与40元开支。` : me.alive ? `已发工资${money(me.wage)}，消费前需支付25元生活费。` : "你已淘汰，可继续观看。";
        if (me.role === "capitalist") fields = '<label>产品单价<input name="price" type="number" min="1" step="1" value="8" required></label>';
        button = me.role === "capitalist" ? "公布售价" : "查看售价并进入消费";
    } else if (phase === "consume") {
        title = "购买产品";
        hint = me.role === "capitalist" ? "售价已公布。工人已支付生活费，即将统一购买。" : me.alive ? `生活费已扣除，可用资金${money(me.assets)}，必须购买1件。` : `你已淘汰${me.reason ? `：${me.reason}` : ""}，可继续观看。`;
        if (buying) fields = `<label>购买企业<select name="purchase">${affordable(me).map((c) => `<option value="${c.id}">${c.name} · ${money(c.price)}</option>`).join("")}</select></label>`;
        button = buying ? "购买并结算" : "结算本轮";
    } else {
        title = game.finished ? "游戏结束" : "本轮结算";
        hint = [game.endReason, ...game.notes].filter(Boolean).join(" ") || "本轮无人淘汰或降级。";
        button = game.finished ? null : "下一轮";
    }
    $("#phase-title").textContent = title;
    $("#hint").textContent = hint;
    $("#error").textContent = "";
    $("#action").innerHTML = fields + (button ? `<button type="submit">${button}</button>` : "");
    $("#results").hidden = phase !== "result";
    if (phase === "result") renderResults();
}

function renderResults() {
    const ranking = (role, name) => {
        const group = game.people.filter((p) => p.role === role && p.alive).sort((a, b) => b.assets - a.assets);
        return `<h3>${name}</h3>${group.length ? `<ol>${group.map((p) => `<li>${label(p)} · ${money(p.assets)}${p.assets === group[0].assets ? " · 第一名" : ""}</li>`).join("")}</ol>` : "<p>无</p>"}`;
    };
    const gains = game.companies.map((c) => {
        const change = c.assets - c.opening;
        return `<li>${label(c)}：${c.output} × ${c.buyers} ÷ ${game.workerCount} ≈ ${c.sales} 件，收入 ${money(c.sales * c.price)}，本轮${change >= 0 ? "盈利" : "亏损"} ${money(Math.abs(change))}</li>`;
    }).join("");
    $("#results").innerHTML = `<h2>结算明细</h2><ul>${gains}</ul>${game.finished ? ranking("capitalist", "资本家排名") + ranking("worker", "存活工人排名") : ""}<h3>你的资产</h3><p>${game.history.slice().reverse().map((h) => `第${h.round}轮 ${money(h.assets)}（${h.change >= 0 ? "+" : ""}${h.change}）`).join(" → ")}</p>`;
}

document.querySelectorAll("[data-role]").forEach((button) => button.addEventListener("click", () => start(button.dataset.role)));
$("#action").addEventListener("submit", submit);
$("#notice").addEventListener("close", () => ($("#action button") || $("#restart")).focus());
$("#restart").addEventListener("click", () => {
    $("#start").hidden = false;
    $("#game").hidden = true;
    $("#restart").hidden = true;
    game = null;
});
