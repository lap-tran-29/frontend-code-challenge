const PRICE_URL = "https://interview.switcheo.com/prices.json";
const TOKEN_ICON_URL =
  "https://raw.githubusercontent.com/Switcheo/token-icons/main/tokens/";
const SWAP_FEE = 0.003;

const currencyNames = {
  ampLUNA: "Amplified LUNA",
  ATOM: "Cosmos",
  axlUSDC: "Axelar USDC",
  BLUR: "Blur",
  bNEO: "Neo",
  BUSD: "Binance USD",
  ETH: "Ethereum",
  EVMOS: "Evmos",
  GMX: "GMX",
  IBCX: "IBC Index",
  IRIS: "IRISnet",
  KUJI: "Kujira",
  LSI: "Liquid Staking Index",
  LUNA: "Terra Luna",
  OKB: "OKB",
  OKT: "OKT Chain",
  OSMO: "Osmosis",
  RATOM: "Staked ATOM",
  rSWTH: "Reward SWTH",
  STATOM: "Stride Staked ATOM",
  STEVMOS: "Stride Evmos",
  STLUNA: "Stride Staked LUNA",
  STOSMO: "Stride Staked OSMO",
  STRD: "Stride",
  SWTH: "Carbon",
  USD: "US Dollar",
  USC: "USD Coin",
  USDC: "USD Coin",
  WBTC: "Wrapped Bitcoin",
  wstETH: "Wrapped stETH",
  YieldUSD: "Yield USD",
  ZIL: "Zilliqa",
};

const elements = {
  amount: document.querySelector("#input-amount"),
  amountError: document.querySelector("#amount-error"),
  inputCurrency: document.querySelector("#input-currency"),
  inputFiat: document.querySelector("#input-fiat"),
  inputIcon: document.querySelector("#input-icon"),
  outputAmount: document.querySelector("#output-amount"),
  outputCurrency: document.querySelector("#output-currency"),
  outputFiat: document.querySelector("#output-fiat"),
  outputIcon: document.querySelector("#output-icon"),
  exchangeRate: document.querySelector("#exchange-rate"),
  swapFee: document.querySelector("#swap-fee"),
  minimumReceived: document.querySelector("#minimum-received"),
  reverseButton: document.querySelector("#reverse-button"),
  submitButton: document.querySelector("#submit-button"),
  form: document.querySelector("#swap-form"),
  notice: document.querySelector("#form-notice"),
  settingsButton: document.querySelector("#settings-button"),
  settingsPanel: document.querySelector("#slippage-settings"),
};

let prices = new Map();
let slippage = 0.005;
let isReady = false;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 8,
  minimumFractionDigits: 2,
});

const fiatFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatCurrency(value) {
  return currencyFormatter.format(value);
}

function formatFiat(value) {
  return fiatFormatter.format(value);
}

function updateTokenIcon(image, currency) {
  image.alt = currency;
  image.onerror = () => {
    image.onerror = null;
    const initials = currency
      .slice(0, 2)
      .toUpperCase()
      .replace(/[&<>"']/g, (character) => {
        const entities = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        };
        return entities[character];
      });
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#887afa"/><stop offset="1" stop-color="#5648d5"/></linearGradient></defs><circle cx="24" cy="24" r="24" fill="url(#g)"/><text x="24" y="29" fill="white" font-family="Arial,sans-serif" font-size="15" font-weight="700" text-anchor="middle">${initials}</text></svg>`;
    image.src = `data:image/svg+xml,${encodeURIComponent(fallbackSvg)}`;
  };
  image.src = `${TOKEN_ICON_URL}${encodeURIComponent(currency)}.svg`;
}

function addCurrencyOptions() {
  const currencies = [...prices.keys()].sort((left, right) => {
    const preferred = ["USDC", "USD", "ETH", "WBTC", "ATOM", "OSMO"];
    const leftRank = preferred.indexOf(left);
    const rightRank = preferred.indexOf(right);
    if (leftRank !== -1 || rightRank !== -1) {
      return (leftRank === -1 ? preferred.length : leftRank) -
        (rightRank === -1 ? preferred.length : rightRank);
    }
    return left.localeCompare(right);
  });

  for (const select of [elements.inputCurrency, elements.outputCurrency]) {
    select.replaceChildren(
      ...currencies.map((currency) => {
        const option = document.createElement("option");
        option.value = currency;
        option.textContent = currency;
        option.title = currencyNames[currency] || currency;
        return option;
      }),
    );
    select.disabled = false;
  }

  if (prices.has("USDC") && prices.has("ETH")) {
    elements.inputCurrency.value = "USDC";
    elements.outputCurrency.value = "ETH";
  } else {
    elements.inputCurrency.selectedIndex = 0;
    elements.outputCurrency.selectedIndex = currencies.length > 1 ? 1 : 0;
  }

  elements.reverseButton.disabled = currencies.length < 2;
  updateTokenIcon(elements.inputIcon, elements.inputCurrency.value);
  updateTokenIcon(elements.outputIcon, elements.outputCurrency.value);
}

function setNotice(message, state = "") {
  elements.notice.textContent = message;
  elements.notice.className = `form-notice${state ? ` ${state}` : ""}`;
}

function getQuote() {
  const from = elements.inputCurrency.value;
  const to = elements.outputCurrency.value;
  const fromPrice = prices.get(from);
  const toPrice = prices.get(to);
  const amount = Number(elements.amount.value);

  if (!isReady || !fromPrice || !toPrice) {
    return null;
  }

  const marketRate = fromPrice / toPrice;
  const hasValidAmount =
    elements.amount.value.trim() !== "" &&
    Number.isFinite(amount) &&
    amount > 0;
  const estimatedReceive = hasValidAmount
    ? (amount * marketRate * (1 - SWAP_FEE))
    : 0;

  return { amount, from, to, fromPrice, toPrice, marketRate, estimatedReceive, hasValidAmount };
}

function validateAmount(quote) {
  if (elements.amount.value.trim() === "") {
    elements.amountError.textContent = "";
    return false;
  }

  if (!Number.isFinite(Number(elements.amount.value))) {
    elements.amountError.textContent = "Enter a valid amount.";
    return false;
  }

  if (Number(elements.amount.value) <= 0) {
    elements.amountError.textContent = "Amount must be greater than zero.";
    return false;
  }

  if (
    quote &&
    (!Number.isFinite(quote.amount * quote.fromPrice) ||
      !Number.isFinite(quote.estimatedReceive))
  ) {
    elements.amountError.textContent = "This amount is too large to quote.";
    return false;
  }

  elements.amountError.textContent = "";
  return true;
}

function updateQuote() {
  const quote = getQuote();
  const amountIsValid = validateAmount(quote);

  if (!quote) {
    elements.outputAmount.value = "";
    elements.inputFiat.textContent = "≈ $0.00";
    elements.outputFiat.textContent = "≈ $0.00";
    elements.exchangeRate.textContent = "Rates unavailable";
    elements.minimumReceived.textContent = "—";
    elements.submitButton.disabled = true;
    return;
  }

  const { amount, from, to, fromPrice, toPrice, marketRate, estimatedReceive } = quote;
  const validQuoteAmount = quote.hasValidAmount && amountIsValid;
  const inputValue = validQuoteAmount ? amount * fromPrice : 0;
  const outputValue = validQuoteAmount ? estimatedReceive * toPrice : 0;
  const minimumReceive = estimatedReceive * (1 - slippage);

  elements.inputFiat.textContent = `≈ ${formatFiat(inputValue)}`;
  elements.outputFiat.textContent = `≈ ${formatFiat(outputValue)}`;
  elements.outputAmount.value = validQuoteAmount
    ? formatCurrency(estimatedReceive)
    : "";
  elements.exchangeRate.textContent =
    `1 ${from} = ${formatCurrency(marketRate)} ${to}`;
  elements.minimumReceived.textContent = validQuoteAmount
    ? `${formatCurrency(minimumReceive)} ${to}`
    : "—";
  elements.swapFee.textContent = "0.3%";
  elements.submitButton.disabled = !amountIsValid;
}

function keepCurrenciesDifferent(changedSelect) {
  if (elements.inputCurrency.value !== elements.outputCurrency.value) {
    return;
  }

  const otherSelect =
    changedSelect === elements.inputCurrency
      ? elements.outputCurrency
      : elements.inputCurrency;
  const otherOption = [...otherSelect.options].find(
    (option) => option.value !== changedSelect.value,
  );

  if (otherOption) {
    otherSelect.value = otherOption.value;
    updateTokenIcon(
      otherSelect === elements.inputCurrency
        ? elements.inputIcon
        : elements.outputIcon,
      otherOption.value,
    );
  }
}

elements.amount.addEventListener("input", () => {
  setNotice("Rates are estimates and may not reflect executable market prices.");
  updateQuote();
});

for (const select of [elements.inputCurrency, elements.outputCurrency]) {
  select.addEventListener("change", () => {
    keepCurrenciesDifferent(select);
    updateTokenIcon(
      select === elements.inputCurrency ? elements.inputIcon : elements.outputIcon,
      select.value,
    );
    setNotice("Rates are estimates and may not reflect executable market prices.");
    updateQuote();
  });
}

elements.reverseButton.addEventListener("click", () => {
  const previousInput = elements.inputCurrency.value;
  elements.inputCurrency.value = elements.outputCurrency.value;
  elements.outputCurrency.value = previousInput;
  updateTokenIcon(elements.inputIcon, elements.inputCurrency.value);
  updateTokenIcon(elements.outputIcon, elements.outputCurrency.value);
  setNotice("Currencies switched. Review your updated estimate.");
  updateQuote();
});

elements.settingsButton.addEventListener("click", () => {
  const isExpanded =
    elements.settingsButton.getAttribute("aria-expanded") === "true";
  elements.settingsButton.setAttribute("aria-expanded", String(!isExpanded));
  elements.settingsPanel.hidden = isExpanded;
});

for (const button of document.querySelectorAll(".slippage-option")) {
  button.addEventListener("click", () => {
    slippage = Number(button.dataset.slippage) / 100;
    document
      .querySelector(".slippage-option.selected")
      ?.classList.remove("selected");
    button.classList.add("selected");
    updateQuote();
  });
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const quote = getQuote();
  if (!quote || !validateAmount(quote)) {
    elements.amount.focus();
    return;
  }

  setNotice(
    `Quote ready: ${formatCurrency(quote.amount)} ${quote.from} for about ${formatCurrency(quote.estimatedReceive)} ${quote.to}. This preview does not execute a transaction.`,
    "success",
  );
});

async function loadPrices() {
  elements.submitButton.disabled = true;
  setNotice("Loading reference prices…");

  try {
    const response = await fetch(PRICE_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Price feed returned ${response.status}.`);
    }

    const entries = await response.json();
    if (!Array.isArray(entries)) {
      throw new Error("Price feed returned an unexpected response.");
    }

    const latestPrices = new Map();
    let newestDate = 0;

    for (const entry of entries) {
      const price = Number(entry.price);
      const date = Date.parse(entry.date);
      if (
        typeof entry.currency !== "string" ||
        !Number.isFinite(price) ||
        price <= 0 ||
        !Number.isFinite(date)
      ) {
        continue;
      }

      const existing = latestPrices.get(entry.currency);
      if (!existing || date >= existing.date) {
        latestPrices.set(entry.currency, { price, date });
      }
      newestDate = Math.max(newestDate, date);
    }

    if (latestPrices.size < 2) {
      throw new Error("Price feed did not contain enough usable currencies.");
    }

    prices = new Map(
      [...latestPrices].map(([currency, record]) => [currency, record.price]),
    );
    addCurrencyOptions();
    isReady = true;
    updateQuote();

    const updatedDate = new Date(newestDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    setNotice(
      `Reference prices loaded · feed data dated ${updatedDate}. Estimates only.`,
    );
  } catch (error) {
    console.error("Unable to load currency reference prices:", error);
    isReady = false;
    elements.inputCurrency.disabled = true;
    elements.outputCurrency.disabled = true;
    elements.reverseButton.disabled = true;
    elements.exchangeRate.textContent = "Rates unavailable";
    setNotice(
      "Could not load reference prices. Check your connection and refresh to try again.",
      "error",
    );
  }
}

loadPrices();
