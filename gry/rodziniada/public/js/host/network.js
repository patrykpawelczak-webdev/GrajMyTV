export function setupSocket(socket, handlers) {
    socket.on('gameCreated', handlers.onGameCreated);
    socket.on('joinedHost', handlers.onJoinedHost);
    socket.on('joinError', handlers.onJoinError);
    socket.on('gameStateUpdated', handlers.onGameStateUpdated);
    socket.on('gameEnded', handlers.onGameEnded);
    socket.on('gamesListUpdated', handlers.onGamesListUpdated);
}

export function createGame(socket, initialState, name) {
    socket.emit('createGame', { initialState, name });
}

export function updateGameState(socket, gameId, state) {
    socket.emit('updateGameState', { gameId, state });
}

export function showBigX(socket, gameId, count) {
    socket.emit('showBigX', { gameId, count });
}

export function showPoints(socket, gameId, points, teamName) {
    socket.emit('showPoints', { gameId, points, teamName });
}

export function showWinner(socket, gameId, winnerName) {
    socket.emit('showWinner', { gameId, winnerName });
}

export function hideWinner(socket, gameId) {
    socket.emit('hideWinner', { gameId });
}

export function playRevealSound(socket, gameId) {
    socket.emit('playRevealSound', { gameId });
}

export function startDisplay(socket, gameId) {
    socket.emit('startDisplay', { gameId });
}

export function endGame(socket, gameId) {
    socket.emit('endGame', { gameId });
}
