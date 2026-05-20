module.exports = function(io, logInfo, logSuccess, logWarn, logError, c) {
    const exports = {};

    const games      = {};
    const codeToGame = {};

    function generateCode() {
        let code;
        do { code = String(Math.floor(100000 + Math.random() * 900000)); }
        while (codeToGame[code]);
        return code;
    }

    function generateGameId() {
        return 'g_' + Math.random().toString(36).substring(2, 10);
    }

    function createGame(initialState, name, isOnline) {
        const gameId   = generateGameId();
        const hostCode = generateCode();
        const tvCode   = generateCode();
        games[gameId] = {
            id: gameId, name: name || 'Rozgrywka',
            hostCode, tvCode, state: initialState,
            hostCount: 0, createdAt: Date.now(),
            isOnline: !!isOnline
        };
        codeToGame[hostCode] = { gameId, role: 'host' };
        codeToGame[tvCode]   = { gameId, role: 'tv' };
        return games[gameId];
    }

    function cleanupGame(gameId) {
        const game = games[gameId];
        if (!game) return;
        delete codeToGame[game.hostCode];
        delete codeToGame[game.tvCode];
        delete games[gameId];
        logWarn('RODZINIADA', `Gra ${c.yellow}${gameId}${c.reset} usunieta`);
        io.emit('gamesListUpdated', getGamesList());
    }

    function getGamesList() {
        const list = Object.values(games).map(g => ({
            gameId:    g.id,
            name:      g.name,
            hasHost:   g.hostCount >= 1,
            createdAt: g.createdAt,
            hostCode:  g.hostCode,
            tvCode:    g.tvCode,
            isOnline:  !!g.isOnline
        }));
        return list;
    }

    function getRoomInfo(gameId) {
        const room = io.adapter.rooms.get(`game:${gameId}`);
        return room ? room.size : 0;
    }

    io.on('connection', (socket) => {
        logInfo('RODZINIADA', `Polaczono: ${c.cyan}${socket.id.slice(0,8)}${c.reset}`);

        socket.data.gameId = null;
        socket.data.role   = null;

        socket.emit('gamesListUpdated', getGamesList());

        socket.onAny((event, data) => {
            if (event === 'updateGameState') return;
            logInfo('RODZINIADA',
                `${c.cyan}${socket.id.slice(0,8)}${c.reset} [${c.yellow}${socket.data.role||'?'}${c.reset}] >> ${c.bright}${event}${c.reset}`);
        });

        socket.on('createGame', ({ initialState, name, isOnline }) => {
            const game = createGame(initialState, name, isOnline);
            socket.join(`game:${game.id}`);
            socket.data.gameId = game.id;
            socket.data.role   = 'host';
            game.hostCount++;

            logSuccess('RODZINIADA',
                `Nowa gra: ${c.magenta}${game.id}${c.reset} "${c.green}${game.name}${c.reset}"`);

            socket.emit('gameCreated', {
                gameId: game.id, hostCode: game.hostCode,
                tvCode: game.tvCode, state: game.state
            });

            io.emit('gamesListUpdated', getGamesList());
        });

        socket.on('joinAsHost', ({ code }) => {
            const entry = codeToGame[code];
            if (!entry || entry.role !== 'host') {
                socket.emit('joinError', { message: 'Nieprawidłowy kod hosta' });
                return;
            }
            const game = games[entry.gameId];
            if (!game) {
                socket.emit('joinError', { message: 'Gra nie istnieje' });
                return;
            }

            if (game.reconnectTimer) {
                clearTimeout(game.reconnectTimer);
                game.reconnectTimer = null;
                logSuccess('RODZINIADA', `Host powrocil! Timer zreconnectu anulowany.`);
            }

            socket.join(`game:${game.id}`);
            socket.data.gameId = game.id;
            socket.data.role   = 'host';
            game.hostCount++;

            logSuccess('RODZINIADA',
                `Host dolaczyl: gra=${c.magenta}${game.id}${c.reset}`);

            socket.emit('joinedHost', {
                gameId: game.id, hostCode: game.hostCode,
                tvCode: game.tvCode, state: game.state
            });

            io.emit('gamesListUpdated', getGamesList());
        });

        socket.on('joinAsTv', ({ code }) => {
            const entry = codeToGame[code];
            if (!entry || entry.role !== 'tv') {
                socket.emit('joinError', { message: 'Nieprawidłowy kod TV' });
                return;
            }
            const game = games[entry.gameId];
            if (!game) {
                socket.emit('joinError', { message: 'Gra nie istnieje' });
                return;
            }
            socket.join(`game:${game.id}`);
            socket.data.gameId = game.id;
            socket.data.role   = 'tv';

            logSuccess('RODZINIADA',
                `TV dolaczyl: gra=${c.magenta}${game.id}${c.reset}`);

            socket.emit('joinedTv', { gameId: game.id, state: game.state });
        });

        socket.on('joinAsPlayer', ({ code, name }) => {
            const entry = codeToGame[code];
            if (!entry) {
                socket.emit('joinError', { message: 'Nieprawidłowy kod pokoju' });
                return;
            }
            const game = games[entry.gameId];
            if (!game) {
                socket.emit('joinError', { message: 'Gra nie istnieje' });
                return;
            }

            socket.join(`game:${game.id}`);
            socket.data.gameId = game.id;
            socket.data.role   = 'player';
            socket.data.name   = name;

            const playerId = 'p_' + Math.random().toString(36).substring(2, 8);
            socket.data.playerId = playerId;

            if (!game.state.lobby) {
                game.state.lobby = { unassigned: [], presenter: null, team1: [], team2: [] };
            }

            game.state.lobby.unassigned.push({ id: playerId, name: name });

            logSuccess('RODZINIADA', `Gracz ${c.cyan}${name}${c.reset} dolaczyl: gra=${c.magenta}${game.id}${c.reset}`);

            socket.emit('joinedPlayer', { gameId: game.id, state: game.state, playerId, tvCode: game.tvCode, hostCode: game.hostCode });
            io.to(`game:${game.id}`).emit('gameStateUpdated', { gameId: game.id, state: game.state });
        });

        socket.on('updateGameState', ({ gameId, state }) => {
            const game = games[gameId];
            if (!game || socket.data.role !== 'host' || socket.data.gameId !== gameId) return;
            game.state = state;
            io.to(`game:${gameId}`).emit('gameStateUpdated', { gameId, state });
        });

        socket.on('showBigX', ({ gameId, count }) => {
            const game = games[gameId];
            if (!game || socket.data.gameId !== gameId) return;
            io.to(`game:${gameId}`).emit('showBigX', count);
        });

        socket.on('showPoints', ({ gameId, points, teamName }) => {
            const game = games[gameId];
            if (!game || socket.data.gameId !== gameId) return;
            logSuccess('RODZINIADA', `Punkty: ${c.green}${teamName}${c.reset} +${c.yellow}${points}${c.reset}`);
            io.to(`game:${gameId}`).emit('showPoints', { points, teamName });
        });

        socket.on('showWinner', ({ gameId, winnerName }) => {
            const game = games[gameId];
            if (!game || socket.data.gameId !== gameId) return;
            logSuccess('RODZINIADA', `Zwyciezca: ${c.green}${winnerName}${c.reset}`);
            io.to(`game:${gameId}`).emit('showWinner', { winnerName });
        });

        socket.on('hideWinner', ({ gameId }) => {
            const game = games[gameId];
            if (!game || socket.data.gameId !== gameId) return;
            io.to(`game:${gameId}`).emit('hideWinner');
        });

        socket.on('playRevealSound', ({ gameId }) => {
            const game = games[gameId];
            if (!game || socket.data.gameId !== gameId) return;
            io.to(`game:${gameId}`).emit('playRevealSound');
        });

        socket.on('startDisplay', ({ gameId }) => {
            const game = games[gameId];
            if (!game || socket.data.gameId !== gameId) return;
            logSuccess('RODZINIADA', `Start TV: gra=${c.magenta}${gameId}${c.reset}`);
            io.to(`game:${gameId}`).emit('startDisplay');
        });

        socket.on('endGame', ({ gameId }) => {
            const game = games[gameId];
            if (!game || socket.data.role !== 'host' || socket.data.gameId !== gameId) return;
            logWarn('RODZINIADA', `Koniec gry: ${c.magenta}${gameId}${c.reset}`);
            io.to(`game:${gameId}`).emit('gameEnded');
            cleanupGame(gameId);
        });

        socket.on('disconnect', (reason) => {
            const { gameId, role, playerId } = socket.data;
            if (!gameId) return;
            const game = games[gameId];
            if (!game) return;

            if (role === 'host') {
                game.hostCount = Math.max(0, game.hostCount - 1);
                logWarn('RODZINIADA', `Host wyszedl: hostow=${c.yellow}${game.hostCount}${c.reset}`);

                if (game.hostCount === 0) {
                    const unassignedPlayers = (game.state.lobby && game.state.lobby.unassigned || []).filter(p => p.id !== 'creator');
                    const team1Players = (game.state.lobby && game.state.lobby.team1) || [];
                    const team2Players = (game.state.lobby && game.state.lobby.team2) || [];
                    const hasOtherPlayers = unassignedPlayers.length > 0 || team1Players.length > 0 || team2Players.length > 0;

                    if (!game.isOnline || (!game.state.displayStarted && !hasOtherPlayers)) {
                        // Dla gry lokalnej LUB pustej poczekalni online (brak startu i innych graczy): usuń grę natychmiast!
                        logWarn('RODZINIADA', `Gra lokalna lub pusta poczekalnia - host wyszedl, natychmiast niszcze gre: ${c.magenta}${gameId}${c.reset}`);
                        io.to(`game:${gameId}`).emit('gameEnded');
                        cleanupGame(gameId);
                    } else {
                        // Dla aktywnej gry online (wystartowana lub z graczami): daj 30 sekund na powrót
                        logWarn('RODZINIADA', `Rozpoczynam timer 30s na powrot hosta dla: ${c.magenta}${gameId}${c.reset}`);
                        game.reconnectTimer = setTimeout(() => {
                            if (games[gameId] && games[gameId].hostCount === 0) {
                                logError('RODZINIADA', `Host nie wrocil, niszcze gre: ${c.magenta}${gameId}${c.reset}`);
                                io.to(`game:${gameId}`).emit('gameEnded');
                                cleanupGame(gameId);
                            }
                        }, 30000);
                    }
                } else {
                    io.emit('gamesListUpdated', getGamesList());
                }
            } else if (role === 'player') {
                if (game.state.lobby) {
                    // Usuwamy gracza z każdej listy w lobby, w której mógł się znajdować
                    ['unassigned', 'team1', 'team2'].forEach(key => {
                        if (Array.isArray(game.state.lobby[key])) {
                            game.state.lobby[key] = game.state.lobby[key].filter(p => p.id !== playerId);
                        }
                    });
                    if (game.state.lobby.presenter && game.state.lobby.presenter.id === playerId) {
                        game.state.lobby.presenter = null;
                    }
                    
                    logWarn('RODZINIADA', `Gracz ${c.cyan}${socket.data.name}${c.reset} opuscil gre`);
                    io.to(`game:${gameId}`).emit('gameStateUpdated', { gameId: gameId, state: game.state });
                }
            }
        });
    });

    // Wyeksportuj forceEndGame i getGamesList dla HTTP endpointów
    exports.forceEndGame = (gameId) => {
        const game = games[gameId];
        if (!game) return false;
        logWarn('RODZINIADA', `[BEACON] Force-end gry: ${c.magenta}${gameId}${c.reset}`);
        io.to(`game:${gameId}`).emit('gameEnded');
        cleanupGame(gameId);
        return true;
    };

    exports.getGamesList = () => getGamesList();

    return exports;
};