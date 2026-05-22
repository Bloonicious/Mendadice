describe('Server', () => {
  test('joinGame adds player to LOBBY', async (server: any) => {
    server.connect({ account: 'user-alice' });
    const roomId = await server.joinGame();
    if (!roomId) throw new Error("No room id returned");
  });
});
