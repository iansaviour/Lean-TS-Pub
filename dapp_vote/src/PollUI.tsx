import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { beginCell } from '@ton/core';

export default function PollUI() {
    // Hooks provided by TON Connect
    const userAddress = useTonAddress();
    const [tonConnectUI] = useTonConnectUI();
    
    // Replace this with your deployed V2 contract address
    const contractAddress = "kQCiJymJOLaMU8SvWGs-b8hHMz3AlP56BWk4YM5HIgp4kC2N"; 

    // Function to handle sending the transaction to the blockchain
    const handleVote = async (opCode: number) => {
        if (!userAddress) return;

        // 1. Pack the operation code (1 for Yes, 2 for No) exactly how your FunC contract expects it
        const body = beginCell()
            .storeUint(opCode, 32)
            .endCell();

        // 2. Build the transaction object
        const transaction = {
            validUntil: Math.floor(Date.now() / 1000) + 360, // Transaction expires in 6 minutes
            network: '-3',
            messages: [
                {
                    address: contractAddress,
                    amount: "10000000", // Send 0.01 TON to cover gas fees
                    payload: body.toBoc().toString("base64") // Convert the cell to a base64 string
                }
            ]
        };

        // 3. Prompt the user's wallet to sign and send
        try {
            await tonConnectUI.sendTransaction(transaction);
            alert("Vote submitted successfully to the blockchain!");
        } catch (error) {
            console.error("Transaction failed or was canceled:", error);
        }
    };

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Online Questionnaire</h2>
                {/* Out-of-the-box UI component */}
                <TonConnectButton />
            </header>

            <main style={{ marginTop: '3rem', textAlign: 'center' }}>
                {userAddress ? (
                    <div>
                        <h3>Do you agree with the proposed changes?</h3>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
                            {/* opCode 1 = YES */}
                            <button 
                                onClick={() => handleVote(1)} 
                                style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                            >
                                Vote YES
                            </button>
                            
                            {/* opCode 2 = NO */}
                            <button 
                                onClick={() => handleVote(2)} 
                                style={{ padding: '10px 20px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
                            >
                                Vote NO
                            </button>
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: '2rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                        <p>Please connect your wallet to access the questionnaire.</p>
                    </div>
                )}
            </main>
        </div>
    );
}