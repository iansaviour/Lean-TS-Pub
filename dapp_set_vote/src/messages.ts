import { NETWORK, NETWORK_LABEL, OTHER_NETWORK } from './config';

export type Lang = 'id' | 'en';

const id = {
    appTitle: 'Set Kuesioner TON',
    switchTo: 'Switch to English',

    navHome: 'Home',
    navCreate: 'Buat Kuesioner',
    navList: 'Kuesioner',

    wrongNetwork: `Wallet terhubung ke ${OTHER_NETWORK}. Pindahkan wallet ke ${NETWORK} lalu hubungkan lagi.`,
    readFailed: 'Data kontrak gagal dibaca.',
    reading: 'Membaca kontrak…',
    noAddress: 'Isi CONTRACT_ADDRESS di src/config.ts dengan alamat kontrak set yang sudah di-deploy.',
    missing: 'Belum ada kontrak aktif di alamat ini.',
    emptyData: 'Data awal kontrak kosong. Deploy ulang dengan data: alamat owner, uint32 0, lalu dua dictionary kosong.',
    contractAddress: 'Contract Address',
    contractAddressMissing: 'Contract Address belum diisi',

    txWaiting: (label: string) => `${label}: menunggu konfirmasi di wallet…`,
    txSent: (label: string) => `${label}: terkirim. Membaca kontrak lagi…`,
    txFailed: (label: string) => `${label}: dibatalkan atau gagal.`,

    heroKicker: 'Set kuesioner on-chain',
    heroTitle: ['Tanya.', 'Jawab.', 'Dapat TON.'],
    statsLabel: 'Dalam angka',
    intro:
        `Buat set berisi 1–5 pertanyaan (masing-masing 2–5 pilihan). Siapa pun dengan wallet ${NETWORK_LABEL} menjawab seluruh set dalam satu transaksi dan mendapat hadiah TON. Setiap alamat hanya bisa menyelesaikan set sekali.`,
    connectHint: `Hubungkan wallet ${NETWORK} dengan tombol di kanan atas untuk mulai.`,
    statSets: 'Set',
    statOpen: 'Masih terbuka',
    statAnswers: 'Penyelesaian',
    howItWorks: 'Cara kerja',
    stepCreateTitle: 'Buat set kuesioner.',
    stepCreate: (fee: string, minReward: string) =>
        `Biaya ${fee} TON, ditambah pool hadiah. Hadiah per penyelesaian harus lebih dari ${minReward} TON, supaya penjawab selalu untung.`,
    stepAnswerTitle: 'Jawab seluruh set.',
    stepAnswer: (value: string) =>
        `Pilih jawaban untuk setiap pertanyaan, lalu kirim ${value} TON sekali. Sisanya dikembalikan bersama hadiah.`,
    stepCloseTitle: 'Tutup kapan saja.',
    stepClose: 'Pembuat bisa menutup setnya dan mengambil sisa pool. Set juga tertutup sendiri saat pool habis.',
    goCreate: 'Buat kuesioner',
    goList: 'Lihat kuesioner',

    createTitle: 'Buat set kuesioner',
    questionsInSet: (n: number, max: number) => `Pertanyaan dalam set (${n}/${max})`,
    questionN: (n: number) => `Pertanyaan ${n}`,
    questionPlaceholder: 'Apakah kamu setuju dengan…',
    optionsLabel: 'Pilihan',
    optionPlaceholder: (n: number) => `Pilihan ${n}`,
    removeOption: 'Hapus',
    addOption: '+ Tambah pilihan',
    removeQuestion: 'Hapus pertanyaan',
    addQuestion: '+ Tambah pertanyaan',
    rewardLabel: 'Hadiah per penyelesaian (TON)',
    rewardHint: (min: string) => `Harus lebih dari ${min} TON (biaya menjawab set).`,
    paidAnswersLabel: 'Jumlah penyelesaian berhadiah',
    totalSent: 'Dikirim:',
    totalBreakdown: (fee: string, pool: string) =>
        `(${fee} biaya kontrak + ${pool} TON pool hadiah). Set tertutup otomatis saat pool habis, dan pembuat bisa menutupnya kapan saja untuk mengambil sisa pool.`,
    createButton: 'Buat set',
    createTxLabel: 'Buat set',
    createNeedsWallet: `Hubungkan wallet ${NETWORK} untuk membuat set.`,
    errNoQuestions: 'Tambahkan minimal satu pertanyaan.',
    errTooManyQuestions: (max: number) => `Maksimal ${max} pertanyaan per set.`,
    errQuestionEmpty: (n: number) => `Pertanyaan ${n} belum diisi.`,
    errQuestionLong: (n: number, max: number, now: number) =>
        `Pertanyaan ${n} maksimal ${max} byte (sekarang ${now}).`,
    errOptionEmpty: (q: number, o: number) => `Pertanyaan ${q}, pilihan ${o} belum diisi.`,
    errOptionLong: (q: number, o: number, max: number, now: number) =>
        `Pertanyaan ${q}, pilihan ${o} maksimal ${max} byte (sekarang ${now}).`,
    errRewardInvalid: 'Hadiah per penyelesaian bukan angka TON yang valid.',
    errRewardLow: (min: string) =>
        `Hadiah per penyelesaian harus lebih dari ${min} TON, yaitu jumlah yang dikirim penjawab.`,
    errPaidAnswers: 'Jumlah penyelesaian berhadiah minimal 1.',

    listTitle: (n: number) => `Kuesioner (${n})`,
    listEmpty: 'Belum ada set.',
    listEmptyCta: 'Buat yang pertama',
    backToList: '← Semua kuesioner',
    notFound: (id: number) => `Set #${id} tidak ditemukan di kontrak ini.`,
    setPreview: (n: number) => `${n} pertanyaan`,

    open: 'Terbuka',
    closed: 'Ditutup',
    submitAnswers: 'Kirim semua jawaban',
    pickOption: 'Pilih satu',
    errIncomplete: 'Pilih jawaban untuk setiap pertanyaan.',
    votes: (n: number, percent: number) => `${n} suara · ${percent}%`,
    answerTxLabel: (id: number) => `Jawab set #${id}`,
    summary: (answers: number, questions: number, creator: string) =>
        `${answers} penyelesaian · ${questions} pertanyaan · dibuat oleh ${creator}`,
    rewardSummary: (reward: string, pool: string, left: string) =>
        ` · hadiah ${reward} TON per penyelesaian · sisa pool ${pool} TON (${left} penyelesaian lagi)`,
    rewardBelowCost: (cost: string) =>
        `Hadiah set ini tidak lebih dari biaya menjawab (${cost} TON), jadi penjawab bisa menerima kembali lebih sedikit dari yang dikirim.`,
    alreadyAnswered: 'Kamu sudah menyelesaikan set ini.',
    answerCost: (value: string) =>
        `Menjawab set mengirim ${value} TON sekali. Kontrak mengembalikan sisanya bersama hadiah.`,
    closeButton: 'Tutup set & ambil sisa pool',
    closeTxLabel: (id: number) => `Tutup set #${id}`,
    share: 'Bagikan link',
    copied: 'Link disalin',
};

export type Messages = typeof id;

const en: Messages = {
    appTitle: 'TON Questionnaire Set',
    switchTo: 'Ganti ke Bahasa Indonesia',

    navHome: 'Home',
    navCreate: 'Create',
    navList: 'Questionnaires',

    wrongNetwork: `Your wallet is on ${OTHER_NETWORK}. Switch the wallet to ${NETWORK} and connect again.`,
    readFailed: 'Could not read the contract data.',
    reading: 'Reading the contract…',
    noAddress: 'Set CONTRACT_ADDRESS in src/config.ts to the address of the deployed set contract.',
    missing: 'There is no active contract at this address.',
    emptyData:
        'The contract was deployed with empty data. Redeploy it with: owner address, uint32 0, then two empty dictionaries.',
    contractAddress: 'Contract Address',
    contractAddressMissing: 'Contract Address is not set',

    txWaiting: (label) => `${label}: waiting for wallet confirmation…`,
    txSent: (label) => `${label}: sent. Reading the contract again…`,
    txFailed: (label) => `${label}: cancelled or failed.`,

    heroKicker: 'On-chain questionnaire sets',
    heroTitle: ['Ask.', 'Answer.', 'Earn TON.'],
    statsLabel: 'In numbers',
    intro:
        `Create a set of 1–5 questions (each with 2–5 options). Anyone with a ${NETWORK_LABEL} wallet answers the whole set in one transaction and earns a TON reward. Each address can complete a set once.`,
    connectHint: `Connect a ${NETWORK} wallet with the button at the top right to get started.`,
    statSets: 'Sets',
    statOpen: 'Still open',
    statAnswers: 'Completions',
    howItWorks: 'How it works',
    stepCreateTitle: 'Create a questionnaire set.',
    stepCreate: (fee, minReward) =>
        `It costs ${fee} TON plus a reward pool. The reward per completion must be more than ${minReward} TON, so answering always pays off.`,
    stepAnswerTitle: 'Answer the whole set.',
    stepAnswer: (value) =>
        `Pick an option for every question, then send ${value} TON once. The rest comes back together with the reward.`,
    stepCloseTitle: 'Close at any time.',
    stepClose:
        'The creator can close their set and take back the remaining pool. A set also closes by itself when the pool runs out.',
    goCreate: 'Create a questionnaire',
    goList: 'Browse questionnaires',

    createTitle: 'Create a questionnaire set',
    questionsInSet: (n, max) => `Questions in the set (${n}/${max})`,
    questionN: (n) => `Question ${n}`,
    questionPlaceholder: 'Do you agree with…',
    optionsLabel: 'Options',
    optionPlaceholder: (n) => `Option ${n}`,
    removeOption: 'Remove',
    addOption: '+ Add option',
    removeQuestion: 'Remove question',
    addQuestion: '+ Add question',
    rewardLabel: 'Reward per completion (TON)',
    rewardHint: (min) => `Must be more than ${min} TON (the cost of answering the set).`,
    paidAnswersLabel: 'Number of paid completions',
    totalSent: 'You send:',
    totalBreakdown: (fee, pool) =>
        `(${fee} contract fee + ${pool} TON reward pool). The set closes by itself when the pool runs out, and the creator can close it at any time to take back the rest.`,
    createButton: 'Create set',
    createTxLabel: 'Create set',
    createNeedsWallet: `Connect a ${NETWORK} wallet to create a set.`,
    errNoQuestions: 'Add at least one question.',
    errTooManyQuestions: (max) => `At most ${max} questions per set.`,
    errQuestionEmpty: (n) => `Question ${n} is empty.`,
    errQuestionLong: (n, max, now) => `Question ${n} can be at most ${max} bytes (now ${now}).`,
    errOptionEmpty: (q, o) => `Question ${q}, option ${o} is empty.`,
    errOptionLong: (q, o, max, now) => `Question ${q}, option ${o} can be at most ${max} bytes (now ${now}).`,
    errRewardInvalid: 'The reward per completion is not a valid TON amount.',
    errRewardLow: (min) =>
        `The reward per completion must be more than ${min} TON, the amount an answerer sends.`,
    errPaidAnswers: 'There must be at least 1 paid completion.',

    listTitle: (n) => `Questionnaires (${n})`,
    listEmpty: 'No sets yet.',
    listEmptyCta: 'Create the first one',
    backToList: '← All questionnaires',
    notFound: (id) => `Set #${id} was not found in this contract.`,
    setPreview: (n) => `${n} ${n === 1 ? 'question' : 'questions'}`,

    open: 'Open',
    closed: 'Closed',
    submitAnswers: 'Submit all answers',
    pickOption: 'Pick one',
    errIncomplete: 'Choose an answer for every question.',
    votes: (n, percent) => `${n} ${n === 1 ? 'vote' : 'votes'} · ${percent}%`,
    answerTxLabel: (id) => `Answer set #${id}`,
    summary: (answers, questions, creator) =>
        `${answers} ${answers === 1 ? 'completion' : 'completions'} · ${questions} ${questions === 1 ? 'question' : 'questions'} · created by ${creator}`,
    rewardSummary: (reward, pool, left) =>
        ` · reward ${reward} TON per completion · ${pool} TON left in the pool (${left} more ${left === '1' ? 'completion' : 'completions'})`,
    rewardBelowCost: (cost) =>
        `This set's reward is not more than the cost of answering (${cost} TON), so an answerer may get back less than they send.`,
    alreadyAnswered: 'You already completed this set.',
    answerCost: (value) =>
        `Answering the set sends ${value} TON once. The contract returns the rest together with the reward.`,
    closeButton: 'Close set & take back the pool',
    closeTxLabel: (id) => `Close set #${id}`,
    share: 'Share link',
    copied: 'Link copied',
};

export const messages: Record<Lang, Messages> = { id, en };
