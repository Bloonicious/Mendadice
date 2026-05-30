import React, { useEffect, useState } from "react";
import { 
  useGameServer, 
  useRoomState, 
  useRoomMyState, 
  useRoomAllUserStates 
} from "@agent8/gameserver";
import "./index.css";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, User, Bot, AlertTriangle, Edit2, Users, Clock, HelpCircle, ChevronLeft, ChevronRight, X, FileText } from "lucide-react";

const helpPages = [
  {
    title: "How to Play Mendadice",
    content: "Mendadice is a thrilling game of deception and probability! Each player starts with 5 dice, hidden securely under their cup. Players take turns bidding on the total number of a specific face value across ALL players' dice. For example, bidding 'three 4s' means you believe there are at least three 4s in total on the table right now."
  },
  {
    title: "Bidding & Lying",
    content: "On your turn, you must either raise the bid (higher quantity, or the same quantity with a higher face value) OR call 'LIAR!' if you think the previous bid is impossible. Aces (1s) are powerful wildcards and count as any face value, making bids more likely to succeed! They have a distinctly dark appearance. If a player calls 'Liar', all cups are revealed. The loser of the challenge loses a die!"
  },
  {
    title: "Origins of Mendadice",
    content: "Mendadice is an exciting spinoff of the classic 'Liar's Dice' (originally known as Dudo or Perudo, originating in South America). Mendadice enhances the classic game with teams, modern rules, and high-stakes bluffing mechanics where your suspicion of every roller's actions is your greatest weapon. Bluff your way to victory!"
  }
];

const connectionRetryDelayMs = 15000;
const defaultAgent8Verse = "W3u3h5L";
const walletAddressPattern = /^0x[a-fA-F0-9]{40}$/;

const getConfiguredVerse = () => {
  const configuredVerse = import.meta.env.VITE_AGENT8_VERSE;
  if (!configuredVerse || walletAddressPattern.test(configuredVerse)) {
    return defaultAgent8Verse;
  }

  return configuredVerse;
};

const gameServerConfig = import.meta.env.PROD
  ? {
      verse: getConfiguredVerse(),
      ...(import.meta.env.VITE_AGENT8_ACCOUNT ? { account: import.meta.env.VITE_AGENT8_ACCOUNT } : {})
    }
  : undefined;

export default function App() {
  const { connected, server } = useGameServer(gameServerConfig);
  const roomState = useRoomState() || {};
  const myState = useRoomMyState();
  const allUsers = useRoomAllUserStates() || [];

  const [joined, setJoined] = useState(false);
  const [roomIdInput, setRoomIdInput] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [bidQty, setBidQty] = useState(1);
  const [bidFace, setBidFace] = useState(2);
  const [peek, setPeek] = useState(false);
  const [editingName, setEditingName] = useState<{id: string, name: string} | null>(null);
  
  const [showHelp, setShowHelp] = useState(false);
  const [helpPage, setHelpPage] = useState(0);
  const [showChangelog, setShowChangelog] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [botDifficulty, setBotDifficulty] = useState('Medium');
  const [showConnectionHelp, setShowConnectionHelp] = useState(false);

  useEffect(() => {
    if (connected) {
      setShowConnectionHelp(false);
      return;
    }

    const timeout = setTimeout(() => {
      setShowConnectionHelp(true);
    }, connectionRetryDelayMs);

    return () => clearTimeout(timeout);
  }, [connected]);

  const handleRetryConnection = () => {
    setShowConnectionHelp(false);
    window.location.reload();
  };

  // Heartbeat for reconnect system
  useEffect(() => {
    if (connected && joined) {
      const interval = setInterval(() => {
        server.remoteFunction("heartbeat", []).catch(() => {});
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [connected, joined, server]);

  const handleJoinLobby = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!connected || roomIdInput.length !== 6) return;
    const targetRoom = roomIdInput.trim().toUpperCase();
    server.remoteFunction("joinGame", [targetRoom]).then((id: string) => {
      setJoined(true);
      setRoomCode(id);
      setBidQty(1);
      setBidFace(2);
      setPeek(false);
    }).catch(console.error);
  };

  const handleCreateLobby = () => {
    if (!connected) return;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    server.remoteFunction("joinGame", [code]).then((id: string) => {
      setJoined(true);
      setRoomCode(id);
      setBidQty(1);
      setBidFace(2);
      setPeek(false);
    }).catch(console.error);
  };

  const handleJoinRandom = () => {
    if (!connected) return;
    server.remoteFunction("joinRandomPublicLobby", []).then((roomId: string) => {
      setJoined(true);
      setRoomCode(roomId);
      setBidQty(1);
      setBidFace(2);
      setPeek(false);
    }).catch(console.error);
  };

  const handleLeaveGame = () => {
    if (!connected) return;
    server.remoteFunction("leaveGame", []).then(() => {
      setJoined(false);
      setRoomCode("");
      setShowExitWarning(false);
      setBidQty(1);
      setBidFace(2);
      setPeek(false);
    }).catch(console.error);
  };

  // Hotkeys and Help Modal Pagination
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      // Modals take priority
      if (showExitWarning) {
        if (e.key === 'Escape') setShowExitWarning(false);
        return;
      }
      
      if (showChangelog) {
        if (e.key === 'Escape') setShowChangelog(false);
        return;
      }
      
      if (showHelp) {
        if (e.key === 'ArrowRight') setHelpPage(p => Math.min(helpPages.length - 1, p + 1));
        if (e.key === 'ArrowLeft') setHelpPage(p => Math.max(0, p - 1));
        if (e.key === 'Escape') setShowHelp(false);
        return;
      }

      // General hotkey to show exit warning
      if (joined && e.key === 'Escape') {
        setShowExitWarning(true);
        return;
      }

      // If user is typing in an input, ignore
      if (document.activeElement?.tagName === 'INPUT') return;

      // Game Hotkeys
      if (roomState?.status === 'PLAYING' && roomState?.currentTurn === server.account) {
        if (e.key.toLowerCase() === 'b') {
          e.preventDefault();
          handleBid();
        } else if (e.key.toLowerCase() === 'l' && roomState?.currentBid) {
          e.preventDefault();
          handleCallLiar();
        }
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [showHelp, showExitWarning, joined, roomState?.status, roomState?.currentTurn, roomState?.currentBid, bidQty, bidFace]);

  useEffect(() => {
    if (roomState?.currentBid) {
      let minQ = roomState.currentBid.quantity;
      if (roomState.currentBid.face === 6) {
        minQ++; // Must increase quantity if face is max
      }
      if (bidQty < minQ) {
        setBidQty(minQ);
        setBidFace(roomState.currentBid.face === 6 ? 2 : roomState.currentBid.face + 1);
      }
    } else {
      setBidQty(1);
      setBidFace(2);
    }
  }, [roomState?.currentBid]);

  // Reset peek when round starts
  useEffect(() => {
    if (roomState?.status === 'PLAYING') {
      setPeek(false);
    } else if (roomState?.status === 'ROUND_OVER') {
      setPeek(true); // Automatically reveal your own when round is over
    }
  }, [roomState?.status]);

  if (!connected) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full p-8 text-center">
          <div className="mx-auto mb-5 w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/40 flex items-center justify-center">
            {showConnectionHelp ? (
              <AlertTriangle className="text-amber-400" size={28} />
            ) : (
              <Clock className="text-amber-400 animate-pulse" size={28} />
            )}
          </div>
          <h1 className="text-2xl font-black tracking-widest mb-3">
            {showConnectionHelp ? "SERVER STILL CONNECTING" : "CONNECTING TO SERVER..."}
          </h1>
          <p className="text-slate-300 leading-relaxed mb-6">
            {showConnectionHelp
              ? "Verse8 is taking longer than expected to respond. This can happen while the game server is waking up or if the creator account is not ready yet."
              : "Connecting to the Mendadice Verse8 game server."}
          </p>
          {showConnectionHelp && (
            <button onClick={handleRetryConnection} className="bg-amber-600 hover:bg-amber-500 text-white font-black tracking-widest py-3 px-6 rounded-lg shadow-lg transition-transform hover:scale-105 active:scale-95">
              RETRY CONNECTION
            </button>
          )}
        </div>
      </div>
    );
  }

  if (joined && roomState?.roomId !== roomCode) {
    return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading Lobby...</div>;
  }

  if (!joined) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4 font-sans relative">
        <div className="absolute top-6 right-6 flex items-center gap-6">
          <button onClick={() => setShowChangelog(true)} className="flex items-center gap-2 text-slate-400 hover:text-amber-400 transition-colors">
            <FileText size={24} />
            <span className="font-bold">Changelog</span>
          </button>
          <button onClick={() => { setShowHelp(true); setHelpPage(0); }} className="flex items-center gap-2 text-slate-400 hover:text-amber-400 transition-colors">
            <HelpCircle size={24} />
            <span className="font-bold">How to Play</span>
          </button>
        </div>

        {showChangelog && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-600 max-w-lg w-full shadow-2xl relative overflow-hidden flex flex-col">
              <button onClick={() => setShowChangelog(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10"><X size={24}/></button>
              <div className="p-8 pb-6 flex-1 max-h-[80vh] overflow-y-auto custom-scrollbar">
                <h3 className="text-2xl font-black text-amber-500 mb-6">Changelog</h3>
                
                <div className="mb-6">
                  <div className="flex items-baseline gap-3 mb-2">
                    <h4 className="text-xl font-bold text-white">Version 1.0</h4>
                    <span className="text-emerald-400 text-sm font-bold bg-emerald-900/30 px-2 py-0.5 rounded">Release Build</span>
                  </div>
                  <ul className="space-y-2 text-slate-300 list-disc list-inside ml-2">
                    <li><strong className="text-white">Bot Difficulty Settings:</strong> You can now alter bot opponent difficulty between Easy, Medium, and Hard.</li>
                    <li><strong className="text-white">Smart Naming Convention:</strong> Adding bots automatically generates a random name based on their difficulty (up to 10 names per difficulty).
                      <ul className="list-[circle] list-inside ml-4 mt-1 text-sm text-slate-400">
                        <li>Easy: Names starting with "E"</li>
                        <li>Medium: Names starting with "M"</li>
                        <li>Hard: Names starting with "H"</li>
                      </ul>
                    </li>
                    <li><strong className="text-white">Dynamic AI Behavior:</strong> Bot difficulty changes how they play the game. Easy bots are dumb, Medium bots have average IQ, and Hard bots are smart.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {showHelp && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-xl border border-slate-600 max-w-lg w-full shadow-2xl relative overflow-hidden flex flex-col">
              <button onClick={() => setShowHelp(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white z-10"><X size={24}/></button>
              <div className="p-8 pb-4 flex-1">
                <h3 className="text-2xl font-black text-amber-500 mb-4">{helpPages[helpPage].title}</h3>
                <p className="text-slate-300 leading-relaxed text-lg">{helpPages[helpPage].content}</p>
              </div>
              <div className="bg-slate-900/50 p-4 border-t border-slate-700 flex justify-between items-center">
                <button onClick={() => setHelpPage(Math.max(0, helpPage - 1))} disabled={helpPage === 0} className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"><ChevronLeft size={24}/></button>
                <div className="flex gap-2">
                  {helpPages.map((_, i) => (
                    <div key={i} className={`w-2 h-2 rounded-full ${i === helpPage ? 'bg-amber-500' : 'bg-slate-600'}`}/>
                  ))}
                </div>
                <button onClick={() => setHelpPage(Math.min(helpPages.length - 1, helpPage + 1))} disabled={helpPage === helpPages.length - 1} className="p-2 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"><ChevronRight size={24}/></button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-800 p-10 rounded-xl shadow-2xl border border-slate-700 w-full max-w-md text-center">
          <h1 className="text-5xl font-black text-amber-500 mb-2 tracking-widest drop-shadow-lg">MENDADICE</h1>
          <p className="text-slate-400 mb-10 text-lg">Bluff your way to victory.</p>
          
          <div className="flex flex-col gap-6">
            <button onClick={handleCreateLobby} className="bg-amber-600 hover:bg-amber-500 text-white font-black tracking-widest py-4 rounded-lg shadow-lg transition-transform hover:scale-105 active:scale-95 w-full">
              CREATE PRIVATE LOBBY
            </button>
            
            <div className="flex items-center gap-4">
              <div className="h-px bg-slate-700 flex-1"></div>
              <span className="text-slate-500 font-bold uppercase tracking-widest text-sm">OR</span>
              <div className="h-px bg-slate-700 flex-1"></div>
            </div>

            <form onSubmit={handleJoinLobby} className="flex gap-2">
              <input 
                type="text" 
                placeholder="6-DIGIT CODE" 
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg p-4 text-center font-bold text-xl text-amber-400 uppercase tracking-widest placeholder:text-slate-600 placeholder:text-sm"
                value={roomIdInput}
                onChange={e => setRoomIdInput(e.target.value.replace(/[^0-9A-Z]/gi, '').toUpperCase())}
                maxLength={6}
                required
              />
              <button type="submit" disabled={roomIdInput.length !== 6} className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-bold px-6 rounded-lg transition-colors">
                JOIN
              </button>
            </form>

            <button onClick={handleJoinRandom} className="bg-emerald-700 hover:bg-emerald-600 text-white font-black tracking-widest py-4 rounded-lg shadow-lg transition-transform hover:scale-105 active:scale-95 w-full mt-4">
              JOIN RANDOM LOBBY
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { status, players, activePlayers, currentTurn, currentBid, logs, lastLoser, revealedDice, winner, teamsEnabled, turnStartTime, isPrivate } = roomState;
  const amIActive = activePlayers?.includes(server.account);
  const isMyTurn = currentTurn === server.account;
  const amIOwner = players?.find((p: string) => {
    const u = allUsers.find((u: any) => u.account === p);
    return u && !u.isBot;
  }) === server.account;

  const handleStart = () => server.remoteFunction("startGame", []);
  const handleAddBot = () => server.remoteFunction("addBot", [botDifficulty]);
  const handleBid = () => {
    server.remoteFunction("placeBid", [bidQty, bidFace]).catch(e => alert(e.message));
  };
  const handleCallLiar = () => server.remoteFunction("callLiar", []).catch(e => alert(e.message));
  const handleRestart = () => server.remoteFunction("restartGame", []);
  const handleToggleTeams = () => server.remoteFunction("toggleTeams", []);
  const handleTogglePrivacy = () => server.remoteFunction("togglePrivacy", []);

  const saveName = (id: string, name: string, isBot: boolean) => {
    if (isBot) {
      server.remoteFunction("setBotName", [id, name]).catch(e => alert(e.message));
    } else {
      server.remoteFunction("setPlayerName", [name]).catch(e => alert(e.message));
    }
    setEditingName(null);
  };

  // Dynamic Colors
  const getPlayerColor = (index: number) => {
    const colors = [
      { name: 'Red', bg: 'bg-[#5c2a2a]', border: 'border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)]', text: 'text-red-400', wild: 'text-slate-950 dark:text-black', nameText: 'text-red-300' }, // P1
      { name: 'Blue', bg: 'bg-[#2a3c5c]', border: 'border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]', text: 'text-blue-400', wild: 'text-slate-950 dark:text-black', nameText: 'text-blue-300' }, // P2
      { name: 'Yellow', bg: 'bg-[#5c522a]', border: 'border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.2)]', text: 'text-yellow-400', wild: 'text-slate-950 dark:text-black', nameText: 'text-yellow-300' }, // P3
      { name: 'Green', bg: 'bg-[#2a5c33]', border: 'border-green-500/50 shadow-[0_0_10px_rgba(34,197,94,0.2)]', text: 'text-green-400', wild: 'text-slate-950 dark:text-black', nameText: 'text-green-300' }, // P4
      { name: 'Orange', bg: 'bg-[#5c3a2a]', border: 'border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.2)]', text: 'text-orange-400', wild: 'text-slate-950 dark:text-black', nameText: 'text-orange-300' }, // P5
      { name: 'Purple', bg: 'bg-[#4a2a5c]', border: 'border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.2)]', text: 'text-purple-400', wild: 'text-slate-950 dark:text-black', nameText: 'text-purple-300' }, // P6
    ];
    return colors[index % colors.length];
  };

  const getPlayerStyle = (pAccountId: string) => {
    const idx = players?.indexOf(pAccountId) ?? 0;
    const u = allUsers.find((u: any) => u.account === pAccountId);
    
    if (teamsEnabled && u?.team !== 'None') {
      if (u?.team === 'Red') return getPlayerColor(0); // Team Red = Red
      if (u?.team === 'Blue') return getPlayerColor(1); // Team Blue = Blue
    }
    return getPlayerColor(idx);
  };

  // Turn Timer
  const TurnTimer = ({ startTime }: { startTime: number }) => {
    const [timeLeft, setTimeLeft] = useState(60);

    useEffect(() => {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setTimeLeft(Math.max(0, 60 - elapsed));
      }, 1000);
      return () => clearInterval(interval);
    }, [startTime]);

    return (
      <div className={`flex items-center gap-1 font-mono text-sm px-2 py-1 rounded ${timeLeft < 10 ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-slate-800 text-slate-300'}`}>
        <Clock size={14} />
        {timeLeft}s
      </div>
    );
  };

  // Helpers
  const renderDice = (face: number, size = 24, style: any) => {
    const props = { size, className: `${style.text} drop-shadow-md` };
    switch(face) {
      case 1: return <Dice1 {...props} className={`${style.wild} drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]`} />; // 1s are wild usually, very dark
      case 2: return <Dice2 {...props} />;
      case 3: return <Dice3 {...props} />;
      case 4: return <Dice4 {...props} />;
      case 5: return <Dice5 {...props} />;
      case 6: return <Dice6 {...props} />;
      default: return null;
    }
  };

  const minQty = currentBid ? (currentBid.face === 6 ? currentBid.quantity + 1 : currentBid.quantity) : 1;

  const handleDecQty = () => {
    setBidQty(Math.max(minQty, bidQty - 1));
  };

  const handleIncQty = () => {
    setBidQty(Math.min(30, bidQty + 1));
  };

  const handleDecFace = () => {
    if (currentBid && bidQty === currentBid.quantity) {
      setBidFace(Math.max(currentBid.face + 1, bidFace - 1));
    } else {
      setBidFace(Math.max(1, bidFace - 1));
    }
  };

  const handleIncFace = () => {
    setBidFace(Math.min(6, bidFace + 1));
  };

  const myStyle = getPlayerStyle(server.account);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans flex flex-col overflow-hidden relative">
      {/* Exit Warning Modal */}
      {showExitWarning && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-xl border border-red-500/50 max-w-sm w-full shadow-2xl relative overflow-hidden flex flex-col p-8 text-center animate-fade-in">
            <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
            <h3 className="text-2xl font-black text-white mb-2">Leave Game?</h3>
            <p className="text-slate-300 mb-8">Are you sure you want to leave the lobby? You will be removed from the current game.</p>
            <div className="flex gap-4">
              <button onClick={() => setShowExitWarning(false)} className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors font-bold text-white">
                Cancel
              </button>
              <button onClick={handleLeaveGame} className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors font-bold shadow-lg">
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-slate-800 p-4 shadow-lg flex justify-between items-center border-b border-slate-700">
        <div className="flex gap-4 items-center">
          <h1 className="text-2xl font-black text-amber-500 tracking-wider">MENDADICE</h1>
          <span className="bg-slate-900 px-3 py-1 rounded text-slate-400 text-sm font-mono tracking-widest border border-slate-700">CODE: {roomCode}</span>
        </div>
        <div className="text-sm flex gap-4 items-center">
          <span>Status: <span className="font-semibold text-emerald-400">{status}</span></span>
          {isPrivate ? <span className="font-semibold text-rose-400 bg-red-900/30 px-2 py-1 rounded">Private</span> : <span className="font-semibold text-emerald-400 bg-emerald-900/30 px-2 py-1 rounded">Public</span>}
          {teamsEnabled && <span className="font-semibold text-purple-400 bg-purple-900/30 px-2 py-1 rounded"><Users className="inline pb-1" size={18}/> Team Mode</span>}
          <button onClick={() => setShowExitWarning(true)} className="ml-4 bg-slate-700 hover:bg-red-600/80 text-white font-bold px-3 py-1.5 rounded transition-colors text-xs uppercase tracking-wider">
            EXIT
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col md:flex-row p-4 gap-4 overflow-hidden">
        
        {/* Game Area */}
        <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-4 flex flex-col relative shadow-xl overflow-y-auto custom-scrollbar">
          {status === "LOBBY" && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-6">
              <h2 className="text-4xl font-black tracking-widest text-amber-500 mb-2 drop-shadow-lg">MENDADICE</h2>
              <p className="text-slate-400 max-w-md text-center mb-4">Roll the dice, keep them hidden under your cup, and outbluff your opponents in this classic game of deception!</p>
              
              {amIOwner && (
                <div className="flex flex-col gap-2 w-full max-w-md">
                  <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700 flex items-center justify-between">
                    <span className="text-slate-300 font-bold flex items-center gap-2"><Users size={18}/> Teams (Red vs Blue):</span>
                    <button onClick={handleToggleTeams} className={`px-4 py-1 rounded font-bold transition-colors ${teamsEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                      {teamsEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700 flex items-center justify-between">
                    <span className="text-slate-300 font-bold flex items-center gap-2">Room Privacy:</span>
                    <button onClick={handleTogglePrivacy} className={`px-4 py-1 rounded font-bold transition-colors ${isPrivate ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>
                      {isPrivate ? 'PRIVATE' : 'PUBLIC'}
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-slate-900 p-6 rounded-xl w-full max-w-md shadow-inner border border-slate-700">
                <h3 className="text-xl mb-4 border-b border-slate-700 pb-2 text-slate-300 flex justify-between">
                  <span>Players ({players?.length || 0}/6)</span>
                  {amIOwner && <span className="text-xs text-amber-500/70 font-normal mt-1">You are the Owner</span>}
                </h3>
                <ul className="space-y-3 mb-6">
                  {players?.map((p: string, i: number) => {
                    const u = allUsers.find((u: any) => u.account === p);
                    const isMe = p === server.account;
                    const canEdit = isMe || (amIOwner && u?.isBot);
                    const isEditing = editingName?.id === p;
                    const pStyle = getPlayerStyle(p);

                    return (
                      <li key={i} className={`flex items-center gap-3 text-lg bg-slate-800 p-2 rounded border-l-4 ${pStyle.border.split(' ')[0]}`}>
                        {u?.isBot ? <Bot className={pStyle.text} /> : <User className={pStyle.text} />}
                        
                        {isEditing ? (
                          <input 
                            autoFocus
                            className="bg-slate-900 border border-amber-500 rounded px-2 py-0.5 text-sm w-32 outline-none"
                            value={editingName.name}
                            onChange={(e) => setEditingName({...editingName, name: e.target.value})}
                            onKeyDown={(e) => e.key === 'Enter' && saveName(p, editingName.name, u?.isBot)}
                            onBlur={() => saveName(p, editingName.name, u?.isBot)}
                          />
                        ) : (
                          <span className={`font-medium ${pStyle.nameText}`}>{u?.name || 'Player'}</span>
                        )}

                        {canEdit && !isEditing && (
                          <button onClick={() => setEditingName({id: p, name: u?.name || ''})} className="text-slate-500 hover:text-amber-400 transition-colors ml-1">
                            <Edit2 size={14}/>
                          </button>
                        )}

                        {isMe && <span className="text-xs bg-emerald-600/30 text-emerald-400 px-2 py-1 rounded-full ml-auto">You</span>}
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex flex-1 gap-0">
                    <button onClick={handleAddBot} disabled={players?.length >= 6 || !amIOwner} className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 rounded-l-lg transition-colors font-semibold disabled:opacity-50">
                      Add Bot
                    </button>
                    <select 
                      value={botDifficulty} 
                      onChange={(e) => setBotDifficulty(e.target.value)}
                      disabled={players?.length >= 6 || !amIOwner}
                      className="w-32 bg-slate-700 hover:bg-slate-600 text-white border-l border-slate-600 px-3 py-3 rounded-r-lg outline-none cursor-pointer disabled:opacity-50 font-semibold"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                  <button onClick={handleStart} disabled={players?.length < 2 || !amIOwner} className="flex-1 py-3 px-4 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors font-semibold shadow-lg disabled:opacity-50">
                    Start Game
                  </button>
                </div>
              </div>
            </div>
          )}

          {(status === "PLAYING" || status === "ROUND_OVER" || status === "GAME_OVER" || status === "STARTING_NEXT_ROUND") && (
            <div className="flex-1 flex flex-col">
              
              {/* Opponents Orbit */}
              <div className="flex justify-center flex-wrap gap-6 mb-8">
                {players?.filter((p:string) => p !== server.account).map((p: string) => {
                  const u = allUsers.find((u: any) => u.account === p);
                  const isTurn = currentTurn === p;
                  const isAlive = activePlayers?.includes(p);
                  const isRevealed = status === "ROUND_OVER" && revealedDice?.[p];
                  const pStyle = getPlayerStyle(p);
                  
                  return (
                    <div key={p} className={`w-36 bg-slate-900/80 rounded-xl p-3 border-2 transition-all duration-300 ${pStyle.border} ${isTurn ? 'shadow-[0_0_20px_rgba(245,158,11,0.4)] transform -translate-y-2 !border-amber-500' : ''} ${!isAlive ? 'opacity-30 grayscale' : ''}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`font-semibold truncate text-sm ${pStyle.nameText}`}>{u?.name || 'Player'}</span>
                        {u?.isBot ? <Bot size={14} className={pStyle.text}/> : <User size={14} className={pStyle.text}/>}
                      </div>

                      {isTurn && status === "PLAYING" && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                           <TurnTimer startTime={turnStartTime} />
                        </div>
                      )}
                      
                      <div className="relative mt-2 flex justify-center h-20 items-end">
                        {/* Revealed Dice */}
                        <div className={`absolute bottom-0 flex flex-wrap gap-1 justify-center w-full transition-opacity duration-500 ${isRevealed ? 'opacity-100' : 'opacity-0'}`}>
                          {revealedDice?.[p] ? (
                            revealedDice[p].map((d: number, i: number) => (
                              <span key={i} className="transform transition-transform">{renderDice(d, 20, pStyle)}</span>
                            ))
                          ) : (
                            <span className="opacity-0">{renderDice(1, 20, pStyle)}</span>
                          )}
                        </div>
                        
                        {/* The Dice Cup */}
                        {u?.diceCount > 0 && (
                          <div className={`absolute bottom-0 transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-bottom flex items-end justify-center w-full ${isRevealed ? '-translate-y-16 opacity-0 rotate-12 scale-110 pointer-events-none' : 'translate-y-0 opacity-100 scale-100'}`}>
                            <div className={`w-16 h-20 ${pStyle.bg} rounded-t-[1rem] rounded-b-sm border-[3px] border-[#2d1b18] shadow-[0_10px_20px_rgba(0,0,0,0.6)] relative overflow-hidden flex flex-col justify-end`}>
                              <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/10 pointer-events-none" />
                              <div className="absolute top-0 w-full h-3 bg-white/10 rounded-t-[0.8rem] pointer-events-none" />
                              <div className="absolute bottom-0 w-full h-1 bg-black/40 pointer-events-none" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-white/60 font-black text-xl drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{u?.diceCount}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {lastLoser === p && <div className="mt-3 text-xs text-red-400 font-bold bg-red-900/40 px-2 py-1 rounded flex items-center justify-center gap-1 animate-pulse"><AlertTriangle size={12}/> Lost a die!</div>}
                    </div>
                  );
                })}
              </div>

              {/* Table Center (Bids) */}
              <div className="flex-1 flex flex-col items-center justify-center">
                {currentBid ? (
                  <div className="bg-slate-900/90 p-8 rounded-full border-4 border-slate-700 flex flex-col items-center shadow-2xl backdrop-blur-sm animate-pulse-slow">
                    <p className="text-sm text-slate-400 uppercase tracking-widest mb-2 font-bold">Current Bid</p>
                    <div className="text-5xl font-black text-amber-500 flex items-center gap-4">
                      {currentBid.quantity} <span className="text-2xl text-slate-500">×</span> {renderDice(currentBid.face, 48, getPlayerStyle(currentBid.account))}
                    </div>
                    <p className="text-slate-300 mt-4 text-sm bg-slate-800 px-4 py-1.5 rounded-full border border-slate-600">
                      by <span className={`font-bold ${getPlayerStyle(currentBid.account).nameText}`}>{allUsers.find((u:any)=>u.account === currentBid.account)?.name || 'Player'}</span>
                    </p>
                  </div>
                ) : (
                  <div className="text-2xl text-slate-500 italic">No bids yet. Round started!</div>
                )}

                {status === "GAME_OVER" && (
                  <div className="mt-8 text-center animate-bounce z-50">
                    <h2 className={`text-5xl font-black mb-6 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)] ${winner?.includes('Red') ? 'text-red-400' : winner?.includes('Blue') ? 'text-blue-400' : 'text-amber-400'}`}>
                      🎉 {winner?.startsWith('Team') ? winner : allUsers.find((u:any)=>u.account === winner)?.name || 'Player'} WINS! 🎉
                    </h2>
                    {amIOwner && (
                      <button onClick={handleRestart} className="px-8 py-3 bg-amber-600 hover:bg-amber-500 rounded-lg text-white font-bold shadow-lg text-lg transition-transform hover:scale-105">
                        Back to Lobby
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* My Hand & Actions */}
              <div className="mt-8 border-t border-slate-700 pt-6">
                <div className="flex flex-col lg:flex-row justify-between items-end gap-4">
                  
                  {/* My Dice */}
                  <div 
                    className={`bg-slate-900 p-4 rounded-xl border-2 flex-1 shadow-inner relative cursor-pointer overflow-hidden transition-colors hover:border-slate-500 ${myStyle.border}`}
                    onMouseEnter={() => setPeek(true)}
                    onMouseLeave={() => { if(status !== 'ROUND_OVER') setPeek(false); }}
                    onClick={() => { if(status !== 'ROUND_OVER') setPeek(!peek); }}
                  >
                    <div className="flex justify-between mb-3 relative z-10">
                      <h3 className="text-lg text-slate-300 font-medium">Your Cup <span className="text-xs text-slate-500 ml-2">(Hover/Click to peek)</span></h3>
                      <div className="flex gap-2 items-center">
                        {teamsEnabled && myState?.team !== 'None' && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${myState?.team === 'Red' ? 'bg-red-900/50 text-red-400' : 'bg-blue-900/50 text-blue-400'}`}>
                            Team {myState?.team}
                          </span>
                        )}
                        {amIActive ? <span className="text-emerald-400 text-sm font-bold bg-emerald-900/30 px-2 py-0.5 rounded">Active</span> : <span className="text-red-400 text-sm font-bold bg-red-900/30 px-2 py-0.5 rounded">Eliminated</span>}
                      </div>
                    </div>
                    
                    <div className="relative flex justify-center items-end h-28 mt-2">
                      {/* The Dice */}
                      <div className={`flex gap-3 items-center justify-center transition-all duration-300 ${peek ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                        {myState?.dice && myState.dice.length > 0 ? (
                          myState?.dice?.map((d: number, i: number) => (
                            <div key={i} className="transform hover:-translate-y-2 transition-transform drop-shadow-xl">
                              {renderDice(d, 48, myStyle)}
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-500 italic font-bold">You have no dice left. Wait for the game to end!</span>
                        )}
                      </div>

                      {/* The Cup covering player's own dice */}
                      {myState?.dice && myState.dice.length > 0 && (
                        <div className={`absolute bottom-0 transition-all duration-500 ease-out origin-bottom transform pointer-events-none flex justify-center w-full ${peek ? '-translate-y-24 opacity-0 scale-110 rotate-3' : 'translate-y-0 opacity-100 scale-100 rotate-0'}`}>
                          <div className={`w-56 h-28 ${myStyle.bg} rounded-t-[2rem] rounded-b-md border-[4px] border-[#2d1b18] shadow-[0_20px_40px_rgba(0,0,0,0.9)] relative overflow-hidden`}>
                            <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-black/20" />
                            <div className="absolute top-0 w-full h-4 bg-white/10 rounded-t-[1.6rem]" />
                            <div className="absolute bottom-0 w-full h-2 bg-black/50" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-white/60 font-black text-2xl tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">YOUR CUP</span>
                              <span className="text-white/40 text-sm font-bold mt-1">{myState.dice.length} DICE</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {status === "PLAYING" && amIActive && (
                    <div className={`w-full lg:w-80 bg-slate-900 p-5 rounded-xl border-2 transition-all duration-300 relative ${isMyTurn ? 'border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.2)] scale-105' : 'border-slate-700 opacity-60'}`}>
                      {isMyTurn && (
                        <div className="absolute -top-4 right-4">
                           <TurnTimer startTime={turnStartTime} />
                        </div>
                      )}
                      <h3 className="text-xl font-bold text-slate-200 mb-4 text-center">{isMyTurn ? 'Your Turn!' : 'Waiting...'}</h3>
                      
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-2 bg-slate-800 p-2 rounded-lg">
                          <label className="text-sm font-semibold text-slate-300">Quantity:</label>
                          <div className="flex items-center gap-2">
                            <button onClick={handleDecQty} disabled={!isMyTurn} className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded font-bold text-lg disabled:opacity-50">-</button>
                            <input type="number" min={minQty} max={30} 
                              className="w-14 bg-slate-900 border border-slate-600 rounded p-1 text-center font-bold text-lg"
                              value={bidQty} onChange={e => setBidQty(Math.min(30, Math.max(minQty, parseInt(e.target.value) || minQty)))} 
                              disabled={!isMyTurn}/>
                            <button onClick={handleIncQty} disabled={!isMyTurn} className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded font-bold text-lg disabled:opacity-50">+</button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 bg-slate-800 p-2 rounded-lg">
                          <label className="text-sm font-semibold text-slate-300">Face:</label>
                          <div className="flex items-center gap-2">
                            <button onClick={handleDecFace} disabled={!isMyTurn} className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded font-bold text-lg disabled:opacity-50">-</button>
                            <div className="w-14 bg-slate-900 border border-slate-600 rounded p-1 flex justify-center items-center">
                              {renderDice(bidFace, 24, myStyle)}
                            </div>
                            <button onClick={handleIncFace} disabled={!isMyTurn} className="w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded font-bold text-lg disabled:opacity-50">+</button>
                          </div>
                        </div>
                        
                        <div className="flex gap-3 mt-2">
                          <button onClick={handleBid} disabled={!isMyTurn} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 py-3 rounded-lg font-black tracking-wider transition-transform hover:scale-105 active:scale-95 disabled:hover:scale-100 shadow-lg flex flex-col items-center">
                            <span>BID</span>
                            <span className="text-[10px] text-emerald-200/50 font-normal">HotKey: B</span>
                          </button>
                          <button onClick={handleCallLiar} disabled={!isMyTurn || !currentBid} className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 py-3 rounded-lg font-black tracking-wider transition-transform hover:scale-105 active:scale-95 disabled:hover:scale-100 shadow-lg flex flex-col items-center">
                            <span>LIAR!</span>
                            <span className="text-[10px] text-red-200/50 font-normal">HotKey: L</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              </div>

            </div>
          )}
        </div>

        {/* Sidebar Log */}
        <div className="w-full md:w-80 bg-slate-800 rounded-xl border border-slate-700 p-4 flex flex-col shadow-xl max-h-64 md:max-h-none">
          <h3 className="text-lg font-bold text-amber-500 mb-4 uppercase tracking-wider border-b border-slate-700 pb-2">Action Log</h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar flex flex-col-reverse">
            {[...(logs || [])].reverse().map((log: any, index: number) => (
              <div key={log.id} className={`text-sm text-slate-300 bg-slate-900/70 p-3 rounded-lg border-l-4 ${index === 0 ? 'border-amber-500 shadow-md' : 'border-slate-600'} animate-fade-in`}>
                {log.text}
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}