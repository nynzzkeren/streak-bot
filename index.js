// ============================================================
// 🤖 DISCORD BOT — index.js
// discord.js v14 | Multi-Streak System
// ============================================================

"use strict";

require("dotenv").config();

const {
  Client,
  GatewayIntentBits
} = require("discord.js");

const {
  handleStreakMessage,
  handleVoiceUpdate,
  startStreakLoop
} = require("./streakSystem");

// ============================================================
// CLIENT
// ============================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ============================================================
// READY
// ============================================================
client.once("ready", () => {
  console.log(`✅ Bot ready: ${client.user.tag}`);
  startStreakLoop(client);
});

// ============================================================
// MESSAGE CREATE
// ============================================================
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  await handleStreakMessage(message);
});

// ============================================================
// VOICE STATE UPDATE
// ============================================================
client.on("voiceStateUpdate", (oldState, newState) => {
  handleVoiceUpdate(oldState, newState);
});

// ============================================================
// LOGIN
// ============================================================
client.login(process.env.TOKEN);
