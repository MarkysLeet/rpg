import express from "express";
import cors from "cors";
import colyseus from 'colyseus';
const { Server } = colyseus;
import { WebSocketTransport } from "@colyseus/ws-transport";
import http from "http";
import marketApi from "./modules/market/marketApi.js";
import { LobbyRoom } from "./modules/rooms/LobbyRoom.js";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());

// Market REST API
app.use("/api/market", marketApi);

// Basic health check
app.get("/health", (req, res) => {
    res.send("Server is healthy!");
});

const server = http.createServer(app);

const gameServer = new Server({
    transport: new WebSocketTransport({
        server
    })
});

// Register Lobby Room
gameServer.define("lobby", LobbyRoom);

gameServer.listen(port).then(() => {
    console.log(`⚔️  Medieval Patterns Server listening on http://localhost:${port}`);
});
