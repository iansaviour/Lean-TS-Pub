import "./style.css";
import { Address, beginCell, toNano } from "@ton/core";
import { TonClient } from "@ton/ton";
import { getHttpEndpoint } from "@orbs-network/ton-access";
import { TonConnectUI } from "@tonconnect/ui";

const CONTRACT = Address.parse("kQC1eFvsm30A-6IiEblGiJpet0O-r1YZa8A1w6nCyeYXY_u0");
const TESTNET_CHAIN = "-3";
const GAS = toNano("0.05");

const counterEl = document.querySelector<HTMLElement>("#counter")!;
const balanceEl = document.querySelector<HTMLElement>("#balance")!;
const senderEl = document.querySelector<HTMLElement>("#sender")!;
const ownerEl = document.querySelector<HTMLElement>("#owner")!;
const walletLine = document.querySelector<HTMLElement>("#wallet-line")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const incrementBtn = document.querySelector<HTMLButtonElement>("#increment")!;
const depositBtn = document.querySelector<HTMLButtonElement>("#deposit")!;
const withdrawBtn = document.querySelector<HTMLButtonElement>("#withdraw")!;
const depositInput = document.querySelector<HTMLInputElement>("#deposit-amount")!;
const withdrawInput = document.querySelector<HTMLInputElement>("#withdraw-amount")!;

const manifestUrl = new URL(
  `${import.meta.env.BASE_URL}tonconnect-manifest.json`,
  window.location.origin
).href;

const tonConnectUI = new TonConnectUI({
  manifestUrl,
  buttonRootId: "ton-connect",
});
tonConnectUI.setConnectionNetwork(TESTNET_CHAIN);

let owner: Address | null = null;
let clientPromise: Promise<TonClient> | null = null;

function client(): Promise<TonClient> {
  clientPromise ??= getHttpEndpoint({ network: "testnet" }).then(
    (endpoint) => new TonClient({ endpoint })
  );
  return clientPromise;
}

function setStatus(message: string, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function shortAddress(address: Address) {
  const text = address.toString({ testOnly: true, bounceable: false });
  return `${text.slice(0, 6)}…${text.slice(-6)}`;
}

function formatTon(value: bigint) {
  const whole = value / 1_000_000_000n;
  const fraction = (value % 1_000_000_000n).toString().padStart(9, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

function connectedWallet() {
  const account = tonConnectUI.account;
  if (!account) return null;
  return {
    address: Address.parse(account.address),
    chain: account.chain,
  };
}

function syncButtons() {
  const wallet = connectedWallet();
  const onTestnet = wallet?.chain === TESTNET_CHAIN;
  incrementBtn.disabled = !onTestnet;
  depositBtn.disabled = !onTestnet;
  const isOwner = Boolean(wallet && owner && wallet.address.equals(owner));
  withdrawBtn.disabled = !onTestnet || !isOwner;
}

async function refresh() {
  try {
    const ton = await client();
    const state = await ton.runMethod(CONTRACT, "get_contract_storage_data");
    const counter = state.stack.readNumber();
    const recentSender = state.stack.readAddress();
    owner = state.stack.readAddress();

    const balanceState = await ton.runMethod(CONTRACT, "balance");
    const balance = balanceState.stack.readBigNumber();

    counterEl.textContent = String(counter);
    balanceEl.textContent = `${formatTon(balance)} TON`;
    senderEl.textContent = recentSender.toString({ testOnly: true, bounceable: false });
    senderEl.title = senderEl.textContent;
    ownerEl.textContent = owner.toString({ testOnly: true, bounceable: false });
    ownerEl.title = ownerEl.textContent;
    if (statusEl.classList.contains("error")) setStatus("");
    syncButtons();
  } catch (error) {
    counterEl.textContent = "—";
    setStatus(
      error instanceof Error ? error.message : "Gagal membaca data kontrak",
      true
    );
  }
}

async function send(body: ReturnType<typeof beginCell>, amount: bigint) {
  const wallet = connectedWallet();
  if (!wallet) {
    setStatus("Hubungkan wallet dulu.", true);
    return;
  }
  if (wallet.chain !== TESTNET_CHAIN) {
    setStatus("Pindahkan wallet ke Testnet.", true);
    return;
  }

  setStatus("Menunggu konfirmasi di wallet…");
  await tonConnectUI.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: CONTRACT.toString({ bounceable: true, testOnly: true }),
        amount: amount.toString(),
        payload: body.endCell().toBoc().toString("base64"),
      },
    ],
  });
  setStatus("Transaksi terkirim. Menunggu pembaruan counter…");
  window.setTimeout(() => {
    void refresh();
  }, 8000);
}

incrementBtn.addEventListener("click", () => {
  void send(beginCell().storeUint(1, 32).storeUint(1, 32), GAS).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : "Transaksi dibatalkan", true);
  });
});

depositBtn.addEventListener("click", () => {
  void send(beginCell().storeUint(2, 32), toNano(depositInput.value.trim())).catch(
    (error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Jumlah setor tidak valid", true);
    }
  );
});

withdrawBtn.addEventListener("click", () => {
  const amount = toNano(withdrawInput.value.trim());
  void send(beginCell().storeUint(3, 32).storeCoins(amount), GAS).catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : "Jumlah tarik tidak valid", true);
  });
});

tonConnectUI.onStatusChange((wallet) => {
  if (!wallet) {
    walletLine.textContent = "Wallet belum terhubung";
    syncButtons();
    return;
  }
  const address = Address.parse(wallet.account.address);
  const network = wallet.account.chain === TESTNET_CHAIN ? "Testnet" : "Mainnet";
  walletLine.textContent = `${shortAddress(address)} · ${network}`;
  if (wallet.account.chain !== TESTNET_CHAIN) {
    setStatus("Wallet ini di Mainnet. Ganti ke Testnet untuk memakai counter.", true);
  } else {
    setStatus("");
  }
  syncButtons();
});

syncButtons();
void refresh();
window.setInterval(() => {
  void refresh();
}, 12000);
