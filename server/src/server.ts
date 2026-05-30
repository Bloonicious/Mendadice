export class Server {
  private MAX_PLAYERS = 6;
  private INITIAL_DICE = 5;
  private BOT_NAMES: Record<string, string[]> = {
    'Easy': ['Eddie', 'Edgar', 'Elon', 'Earl', 'Elsa', 'Emma', 'Eli', 'Eva', 'Ezra', 'Eden'],
    'Medium': ['Mike', 'Mark', 'Matt', 'Mary', 'Mia', 'Mason', 'Max', 'Maya', 'Milo', 'Mila'],
    'Hard': ['Hank', 'Hugh', 'Hal', 'Hope', 'Hazel', 'Harry', 'Hugo', 'Heidi', 'Helen', 'Homer']
  };

  private async addLog(text: string) {
    const state = await $room.getRoomState();
    const logs = state.logs || [];
    logs.push({ text, id: Date.now() + Math.random().toString() });
    if (logs.length > 20) logs.shift();
    await $room.updateRoomState({ logs });
  }

  async joinGame(roomId?: string): Promise<string> {
    const joinedRoomId = await $global.joinRoom(roomId);
    
    let state = await $room.getRoomState();
    if (!state.status) {
      state = await $room.updateRoomState({
        status: 'LOBBY',
        players: [],
        activePlayers: [], // Players still alive
        currentTurn: null,
        currentBid: null,
        logs: [],
        lastCaller: null,
        roundCount: 0,
        teamsEnabled: false,
        isPrivate: false
      });
      await this.addLog("Room created.");
    }

    const account = $sender.account;
    if (state.status === 'LOBBY') {
      const players = state.players || [];
      if (!players.includes(account) && players.length < this.MAX_PLAYERS) {
        players.push(account);
        await $room.updateRoomState({ players });
        const profile = ($sender as any).profile;
        const playerName = profile?.name || profile?.username || 'Player';

        await $room.updateUserState(account, { 
          isBot: false, 
          diceCount: this.INITIAL_DICE, 
          dice: [],
          name: playerName,
          lastSeen: Date.now(),
          team: 'None'
        });
        await this.addLog(`Player ${playerName} joined.`);
      } else if (players.includes(account)) {
        await $room.updateUserState(account, { lastSeen: Date.now() });
      }
    } else {
      // Trying to rejoin during playing
      const players = state.players || [];
      if (players.includes(account)) {
        await $room.updateUserState(account, { lastSeen: Date.now() });
        await this.addLog(`${(await $room.getUserState(account)).name} reconnected.`);
      }
    }
    return joinedRoomId;
  }

  async heartbeat() {
    await $room.updateUserState($sender.account, { lastSeen: Date.now() });
  }

  private sanitizeName(name: string): string {
    return name.replace(/[<>&"'/\\]/g, '').trim().substring(0, 15);
  }

  async setPlayerName(name: string) {
    if (!name) return;
    const sanitized = this.sanitizeName(name);
    if (!sanitized) return;
    await $room.updateUserState($sender.account, { name: sanitized });
  }

  private async isOwner(account: string, state: any): Promise<boolean> {
    for (const p of state.players || []) {
      const u = await $room.getUserState(p);
      if (u && !u.isBot) {
        return p === account;
      }
    }
    return false;
  }

  async setBotName(botId: string, name: string) {
    if (!name) return;
    const state = await $room.getRoomState();
    if (!(await this.isOwner($sender.account, state))) throw new Error("Only room owner can rename bots");
    const bot = await $room.getUserState(botId);
    if (!bot.isBot) throw new Error("Not a bot");
    const sanitized = this.sanitizeName(name);
    if (!sanitized) return;
    await $room.updateUserState(botId, { name: sanitized });
  }

  async togglePrivacy() {
    const state = await $room.getRoomState();
    if (state.status !== 'LOBBY') throw new Error("Can only toggle privacy in lobby");
    if (!(await this.isOwner($sender.account, state))) throw new Error("Only room owner can toggle privacy");
    await $room.updateRoomState({ isPrivate: !state.isPrivate });
    await this.addLog(`Room is now ${!state.isPrivate ? 'PRIVATE' : 'PUBLIC'}.`);
  }

  async toggleTeams() {
    const state = await $room.getRoomState();
    if (state.status !== 'LOBBY') throw new Error("Can only toggle teams in lobby");
    if (!(await this.isOwner($sender.account, state))) throw new Error("Only room owner can toggle teams");
    await $room.updateRoomState({ teamsEnabled: !state.teamsEnabled });
    await this.addLog(`Team mode ${!state.teamsEnabled ? 'enabled' : 'disabled'}.`);
  }

  async joinRandomPublicLobby(): Promise<string> {
    const roomStates = await $global.getAllRoomStates();
    let targetRoomId = undefined;
    for (const state of roomStates) {
      if (state.status === 'LOBBY' && !state.isPrivate && (state.players?.length || 0) < this.MAX_PLAYERS) {
        targetRoomId = state.roomId;
        break;
      }
    }
    return this.joinGame(targetRoomId);
  }

  async leaveGame(): Promise<void> {
    const state = await $room.getRoomState();
    if (state.players?.includes($sender.account)) {
      await this.purgePlayer($sender.account, state);
    }
    await $global.leaveRoom();
  }

  async addBot(difficulty: string = 'Medium'): Promise<void> {
    const state = await $room.getRoomState();
    if (state.status !== 'LOBBY') throw new Error("Can only add bots in LOBBY");
    if (!(await this.isOwner($sender.account, state))) throw new Error("Only room owner can add bots");
    
    const players = state.players || [];
    if (players.length >= this.MAX_PLAYERS) throw new Error("Room is full");

    if (!['Easy', 'Medium', 'Hard'].includes(difficulty)) difficulty = 'Medium';

    const botId = 'BOT_' + Math.random().toString(36).substring(2, 8);
    const namesList = this.BOT_NAMES[difficulty];
    const botName = namesList[Math.floor(Math.random() * namesList.length)] + '_' + Math.floor(Math.random()*100);
    
    players.push(botId);
    await $room.updateRoomState({ players });
    await $room.updateUserState(botId, {
      isBot: true,
      difficulty,
      diceCount: this.INITIAL_DICE,
      dice: [],
      name: botName,
      lastSeen: Date.now(),
      team: 'None'
    });
    await this.addLog(`${botName} (${difficulty} Bot) joined.`);
  }

  async startGame(): Promise<void> {
    const state = await $room.getRoomState();
    if (state.status !== 'LOBBY') throw new Error("Already started");
    if (!(await this.isOwner($sender.account, state))) throw new Error("Only room owner can start the game");
    const players = state.players || [];
    if (players.length < 2) throw new Error("Need at least 2 players");

    await this.addLog("Game starting!");
    const activePlayers = [...players];

    // Assign Teams if enabled
    let teamRed = true;
    for (const p of activePlayers) {
      const team = state.teamsEnabled ? (teamRed ? 'Red' : 'Blue') : 'None';
      await $room.updateUserState(p, { team });
      teamRed = !teamRed; // Alternate
    }

    await this.startRound(activePlayers);
  }

  private async startRound(activePlayers: string[]) {
    await this.addLog("Rolling dice...");
    
    const state = await $room.getRoomState();
    const allPlayers = state.players || [];
    
    for (const p of allPlayers) {
      if (activePlayers.includes(p)) {
        const uState = await $room.getUserState(p);
        const dice = [];
        for (let i = 0; i < uState.diceCount; i++) {
          dice.push(Math.floor(Math.random() * 6) + 1);
        }
        dice.sort();
        await $room.updateUserState(p, { dice });
      } else {
        await $room.updateUserState(p, { dice: [] });
      }
    }

    const startPlayer = activePlayers[Math.floor(Math.random() * activePlayers.length)];
    
    await $room.updateRoomState({
      status: 'PLAYING',
      activePlayers,
      currentTurn: startPlayer,
      currentBid: null,
      lastCaller: null,
      roundCount: (state.roundCount || 0) + 1,
      turnStartTime: Date.now()
    });

    await this.addLog(`New round started. ${(await $room.getUserState(startPlayer)).name}'s turn.`);
  }

  async placeBid(quantity: number, face: number): Promise<void> {
    const state = await $room.getRoomState();
    if (state.status !== 'PLAYING') throw new Error("Not playing");
    const actor = $sender.account;
    if (state.currentTurn !== actor) throw new Error("Not your turn");

    if (!Number.isInteger(face) || face < 1 || face > 6) throw new Error("Face must be between 1 and 6");
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity must be at least 1");

    if (quantity > 30) throw new Error("Quantity cannot exceed 30");

    const currentBid = state.currentBid;
    if (currentBid) {
      if (quantity < currentBid.quantity) {
        throw new Error("Quantity must be at least current bid quantity");
      }
      if (quantity === currentBid.quantity && face <= currentBid.face) {
        throw new Error("If quantity is same, face must be higher");
      }
    } else {
      if (quantity < 1) throw new Error("Quantity must be at least 1");
    }

    const uState = await $room.getUserState(actor);
    await this.addLog(`${uState.name} bids ${quantity} of ${face}s`);

    const active = state.activePlayers;
    const idx = active.indexOf(actor);
    const nextPlayer = active[(idx + 1) % active.length];

    await $room.updateRoomState({
      currentBid: { account: actor, quantity, face },
      currentTurn: nextPlayer,
      turnStartTime: Date.now()
    });
  }

  async callLiar(): Promise<void> {
    const state = await $room.getRoomState();
    if (state.status !== 'PLAYING') throw new Error("Not playing");
    const actor = $sender.account;
    if (state.currentTurn !== actor) throw new Error("Not your turn");
    
    const currentBid = state.currentBid;
    if (!currentBid) throw new Error("No bid to call liar on");

    const callerState = await $room.getUserState(actor);
    const bidderState = await $room.getUserState(currentBid.account);

    await this.addLog(`${callerState.name} calls LIAR on ${bidderState.name}!`);

    // Count dice
    let totalCount = 0;
    const allDice: Record<string, number[]> = {};
    for (const p of state.activePlayers) {
      const uState = await $room.getUserState(p);
      allDice[p] = uState.dice;
      for (const d of uState.dice) {
        // 1s are wild unless the bid face is 1 (strict rule)
        if (d === currentBid.face || (d === 1 && currentBid.face !== 1)) {
          totalCount++;
        }
      }
    }

    await this.addLog(`There are ${totalCount} matching dice.`);

    let loser = '';
    if (totalCount >= currentBid.quantity) {
      await this.addLog(`Bid was SUCCESSFUL! ${callerState.name} loses a die.`);
      loser = actor;
    } else {
      await this.addLog(`Bid was a LIE! ${bidderState.name} loses a die.`);
      loser = currentBid.account;
    }

    const loserState = await $room.getUserState(loser);
    const newDiceCount = loserState.diceCount - 1;
    await $room.updateUserState(loser, { diceCount: newDiceCount });

    let nextActive = [...state.activePlayers];
    if (newDiceCount <= 0) {
      await this.addLog(`${loserState.name} is ELIMINATED!`);
      nextActive = nextActive.filter(p => p !== loser);
    }

    await $room.updateRoomState({
      status: 'ROUND_OVER',
      activePlayers: nextActive,
      lastLoser: loser,
      revealedDice: allDice,
      roundOverTime: Date.now()
    });

    await this.checkWinCondition(nextActive, state.teamsEnabled);
  }

  private async checkWinCondition(activePlayers: string[], teamsEnabled: boolean) {
    if (activePlayers.length <= 1 && !teamsEnabled) {
      if (activePlayers.length === 1) {
        await this.addLog(`${(await $room.getUserState(activePlayers[0])).name} WINS THE GAME!`);
        await $room.updateRoomState({ status: 'GAME_OVER', winner: activePlayers[0] });
      } else {
        await $room.updateRoomState({ status: 'GAME_OVER', winner: 'Nobody' });
      }
      return true;
    }
    if (teamsEnabled && activePlayers.length > 0) {
      const teamsAlive = new Set();
      for (const p of activePlayers) {
        const u = await $room.getUserState(p);
        teamsAlive.add(u.team);
      }
      if (teamsAlive.size === 1) {
        const winningTeam = Array.from(teamsAlive)[0];
        await this.addLog(`TEAM ${winningTeam.toUpperCase()} WINS THE GAME!`);
        await $room.updateRoomState({ status: 'GAME_OVER', winner: `Team ${winningTeam}` });
        return true;
      }
    }
    return false;
  }

  async nextRound(): Promise<void> {
    const state = await $room.getRoomState();
    if (state.status !== 'ROUND_OVER') throw new Error("Not round over");
    if (!(state.players || []).includes($sender.account)) throw new Error("Not a player in this room");
    await this.startRound(state.activePlayers);
  }

  async restartGame(): Promise<void> {
    const state = await $room.getRoomState();
    if (state.status !== 'GAME_OVER') throw new Error("Game not over");
    if (!(await this.isOwner($sender.account, state))) throw new Error("Only room owner can restart the game");
    
    // Reset all players
    for (const p of state.players) {
      await $room.updateUserState(p, { diceCount: this.INITIAL_DICE, dice: [], team: 'None' });
    }

    await $room.updateRoomState({
      status: 'LOBBY',
      activePlayers: [],
      currentTurn: null,
      currentBid: null,
      revealedDice: null,
      lastLoser: null,
      winner: null
    });
    await this.addLog("Game reset. Back to lobby.");
  }

  private async purgePlayer(p: string, state: any) {
    const uState = await $room.getUserState(p);
    if (uState?.name) {
      await this.addLog(`Player ${uState.name} disconnected and was purged.`);
    }
    
    const newPlayers = state.players.filter((x: string) => x !== p);
    
    // If no humans left, reset the room completely
    let humansLeft = 0;
    for (const np of newPlayers) {
      const u = await $room.getUserState(np);
      if (u && !u.isBot) humansLeft++;
    }

    if (humansLeft === 0) {
      await $room.updateRoomState({
        status: 'LOBBY',
        players: [],
        activePlayers: [],
        currentTurn: null,
        currentBid: null,
        logs: [],
        lastCaller: null,
        roundCount: 0,
        teamsEnabled: false,
        isPrivate: false
      });
      return;
    }
    
    if (state.status === 'LOBBY') {
      await $room.updateRoomState({ players: newPlayers });
    } else {
      // If playing, eliminate them
      let nextActive = state.activePlayers.filter((x: string) => x !== p);
      await $room.updateUserState(p, { diceCount: 0, dice: [] });
      
      let newTurn = state.currentTurn;
      if (state.currentTurn === p && state.status === 'PLAYING') {
        // Advance turn
        const idx = state.activePlayers.indexOf(p);
        if (nextActive.length > 0) {
           newTurn = state.activePlayers[(idx) % state.activePlayers.length]; // shifted by 1 automatically
           // Ensure newTurn is actually in nextActive
           while(!nextActive.includes(newTurn) && nextActive.length > 0) {
              const i = state.activePlayers.indexOf(newTurn);
              newTurn = state.activePlayers[(i + 1) % state.activePlayers.length];
           }
        }
      }
      
      await $room.updateRoomState({ 
        players: newPlayers, 
        activePlayers: nextActive,
        currentTurn: newTurn,
        ...(state.currentTurn === p && state.status === 'PLAYING' ? { turnStartTime: Date.now() } : {})
      });
      
      await this.checkWinCondition(nextActive, state.teamsEnabled);
    }
  }

  // Automatically handles bot turns and state transitions
  async $roomTick(deltaMS: number, roomId: string) {
    const state = await $room.getRoomState();
    if (!state.status) return;

    // 1. Check for disconnects / purge (60 seconds)
    for (const p of state.players || []) {
      const uState = await $room.getUserState(p);
      if (!uState.isBot && Date.now() - (uState.lastSeen || 0) > 65000) { // 65s to be safe
         await this.purgePlayer(p, state);
         return; // early return, let next tick handle more
      }
    }

    // Auto-advance round over
    if (state.status === 'ROUND_OVER') {
      if (Date.now() - (state.roundOverTime || 0) > 6000) {
        await $room.updateRoomState({ status: 'STARTING_NEXT_ROUND' });
        await this.startRound(state.activePlayers);
      }
      return;
    }

    // Turn timer and Bot logic
    if (state.status === 'PLAYING' && state.currentTurn) {
      const turnState = await $room.getUserState(state.currentTurn);
      const timeTaken = Date.now() - (state.turnStartTime || 0);

      // Force play after 60s
      if (!turnState.isBot && timeTaken > 60000) {
         await this.addLog(`${turnState.name} took too long! Auto-playing...`);
         try {
           if (state.currentBid) {
             await this.botCallLiar(state.currentTurn);
           } else {
             await this.botPlaceBid(1, 2, state.currentTurn);
           }
         } catch (e) {
           console.error("Auto-play error", e);
         }
         return;
      }

      // Bot turn
      if (turnState.isBot && timeTaken > 2000) {
        // It's a bot's turn, give it a delay to feel real
        await $room.updateRoomState({ turnStartTime: Date.now() + 9999999 }); // Prevent double tick
        await this.executeBotTurn(state.currentTurn, state, turnState);
      }
    }
  }

  private async executeBotTurn(botId: string, state: any, botState: any) {
    try {
      const difficulty = botState.difficulty || 'Medium';
      const currentBid = state.currentBid;
      const totalDiceLeft = state.activePlayers.reduce(async (acc: Promise<number>, p: string) => {
        const c = await acc;
        return c + (await $room.getUserState(p)).diceCount;
      }, Promise.resolve(0));

      const totalDice = await totalDiceLeft;

      if (!currentBid) {
        const faceCounts: Record<number, number> = {1:0,2:0,3:0,4:0,5:0,6:0};
        botState.dice.forEach((d: number) => faceCounts[d]++);
        let bestFace = 2;
        let maxCount = 0;
        
        if (difficulty === 'Easy') {
          bestFace = Math.floor(Math.random() * 5) + 2;
          const bidQty = Math.max(1, Math.floor(Math.random() * (totalDice * 0.3)) + 1);
          await this.botPlaceBid(bidQty, bestFace, botId);
        } else {
          for (let i = 2; i <= 6; i++) {
            if (faceCounts[i] + faceCounts[1] > maxCount) {
              maxCount = faceCounts[i] + faceCounts[1];
              bestFace = i;
            }
          }
          let bidQty = Math.min(30, Math.max(1, maxCount + Math.floor(totalDice * 0.1)));
          if (difficulty === 'Hard') {
            bidQty = Math.min(30, Math.max(1, maxCount + Math.floor((totalDice - botState.diceCount) / 3)));
          }
          await this.botPlaceBid(bidQty, bestFace, botId);
        }
      } else {
        if (difficulty === 'Easy') {
          if (Math.random() > 0.4) {
             if (Math.random() > 0.5 && currentBid.face < 6) {
               await this.botPlaceBid(Math.min(30, currentBid.quantity), currentBid.face + 1, botId);
             } else {
               await this.botPlaceBid(Math.min(30, currentBid.quantity + 1), currentBid.face === 6 ? 2 : currentBid.face, botId);
             }
          } else {
             await this.botCallLiar(botId);
          }
          return;
        }

        let ownCount = 0;
        for (const d of botState.dice) {
          if (d === currentBid.face || (d === 1 && currentBid.face !== 1)) ownCount++;
        }
        
        const othersExpected = ((totalDice - botState.diceCount) / 3);
        const myExpectedTotal = ownCount + othersExpected;

        // Hard calculates with slightly tighter margins
        const tolerance = difficulty === 'Hard' ? 1.0 : 1.5;

        if (currentBid.quantity > myExpectedTotal + tolerance || currentBid.quantity >= 30) {
          await this.botCallLiar(botId);
        } else {
          if (Math.random() > 0.5 && currentBid.face < 6) {
            await this.botPlaceBid(Math.min(30, currentBid.quantity), currentBid.face + 1, botId);
          } else {
            await this.botPlaceBid(Math.min(30, currentBid.quantity + 1), currentBid.face === 6 ? 2 : currentBid.face, botId);
          }
        }
      }
    } catch (e) {
      console.error("Bot turn error", e);
      if (state.currentBid) {
        await this.botCallLiar(botId).catch(() => {});
      } else {
        await this.botPlaceBid(1, 2, botId).catch(() => {});
      }
    }
  }

  private async botPlaceBid(quantity: number, face: number, botId: string): Promise<void> {
    const state = await $room.getRoomState();
    if (state.status !== 'PLAYING') throw new Error("Not playing");
    if (state.currentTurn !== botId) throw new Error("Not this bot's turn");
    const botState = await $room.getUserState(botId);
    if (!botState?.isBot) throw new Error("Not a bot");

    if (!Number.isInteger(face) || face < 1 || face > 6) throw new Error("Face must be between 1 and 6");
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity must be at least 1");
    if (quantity > 30) throw new Error("Quantity cannot exceed 30");

    const currentBid = state.currentBid;
    if (currentBid) {
      if (quantity < currentBid.quantity) throw new Error("Quantity must be at least current bid quantity");
      if (quantity === currentBid.quantity && face <= currentBid.face) throw new Error("If quantity is same, face must be higher");
    }

    await this.addLog(`${botState.name} bids ${quantity} of ${face}s`);

    const active = state.activePlayers;
    const idx = active.indexOf(botId);
    const nextPlayer = active[(idx + 1) % active.length];

    await $room.updateRoomState({
      currentBid: { account: botId, quantity, face },
      currentTurn: nextPlayer,
      turnStartTime: Date.now()
    });
  }

  private async botCallLiar(botId: string): Promise<void> {
    const state = await $room.getRoomState();
    if (state.status !== 'PLAYING') throw new Error("Not playing");
    if (state.currentTurn !== botId) throw new Error("Not this bot's turn");
    const botState = await $room.getUserState(botId);
    if (!botState?.isBot) throw new Error("Not a bot");

    const currentBid = state.currentBid;
    if (!currentBid) throw new Error("No bid to call liar on");

    const bidderState = await $room.getUserState(currentBid.account);
    await this.addLog(`${botState.name} calls LIAR on ${bidderState.name}!`);

    let totalCount = 0;
    const allDice: Record<string, number[]> = {};
    for (const p of state.activePlayers) {
      const uState = await $room.getUserState(p);
      allDice[p] = uState.dice;
      for (const d of uState.dice) {
        if (d === currentBid.face || (d === 1 && currentBid.face !== 1)) totalCount++;
      }
    }

    await this.addLog(`There are ${totalCount} matching dice.`);

    let loser = '';
    if (totalCount >= currentBid.quantity) {
      await this.addLog(`Bid was SUCCESSFUL! ${botState.name} loses a die.`);
      loser = botId;
    } else {
      await this.addLog(`Bid was a LIE! ${bidderState.name} loses a die.`);
      loser = currentBid.account;
    }

    const loserState = await $room.getUserState(loser);
    const newDiceCount = loserState.diceCount - 1;
    await $room.updateUserState(loser, { diceCount: newDiceCount });

    let nextActive = [...state.activePlayers];
    if (newDiceCount <= 0) {
      await this.addLog(`${loserState.name} is ELIMINATED!`);
      nextActive = nextActive.filter(p => p !== loser);
    }

    await $room.updateRoomState({
      status: 'ROUND_OVER',
      activePlayers: nextActive,
      lastLoser: loser,
      revealedDice: allDice,
      roundOverTime: Date.now()
    });

    await this.checkWinCondition(nextActive, state.teamsEnabled);
  }
}
