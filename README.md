# agent-kanban

A self-hosted kanban board shared by one human and their AI agent(s) — one board that both read and write, so they stay on the same page. The human plans their own work, hands selected cards off to an agent, and reviews delegated work before it counts as done.

**Status: early scaffolding.** The design is documented in [`docs/`](docs/) (start with the [state machine](docs/state-machine.md)); the code is a hello-world API skeleton.

## Development

Requires Node ≥ 20.

```sh
npm install
npm run dev        # dev server with reload (http://127.0.0.1:3000/health)
npm test           # run tests
npm run typecheck  # tsc --noEmit
```

## License

MIT
