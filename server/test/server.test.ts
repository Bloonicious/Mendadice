describe('Server', () => {
  test('joinGame returns a valid room id', async (server: any) => {
    await server.connect({ account: 'user-alice' });
    const roomId = await server.joinGame();
    expect(roomId).toBeDefined();
    expect(typeof roomId).toBe('string');
  });

  test('two players can join and start a game', async (server: any) => {
    await server.connect({ account: 'user-alice' });
    const roomId = await server.joinGame();

    await server.connect({ account: 'user-bob' });
    await server.joinGame(roomId);

    await server.connect({ account: 'user-alice' });
    await server.startGame();
  });
});
