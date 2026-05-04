// ============================================================
// 🔥 MULTI-STREAK SYSTEM — streakSystem.js
// discord.js v14 | Clean, modular, production-ready
// ============================================================

"use strict";

const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

// ============================================================
// CONFIG — replace with real IDs
// ============================================================
const CONFIG = {
  USER_A: "1411989784569708555",
  USER_B: "1354470250451570728",
  USER_C: "1140997072124903444",
  CHANNEL_AZZURA: "1500850244446064702",
  CHANNEL_ZEMMA: "1500850463560433784",
};

// ============================================================
// PERSISTENT STORAGE
// ============================================================
const DATA_FILE = path.join(__dirname, "streakData.json");

// ============================================================
// DEFAULT STREAK DATA
// ============================================================
const DEFAULT_STREAKS = [
  {
    id: "azzura",
    name: "Azzura",
    users: [CONFIG.USER_A, CONFIG.USER_B],
    channelId: CONFIG.CHANNEL_AZZURA,
    streak: 403,
    day: 1,
    lastCompleted: Date.now(),
    reminderSent: false,
    badge: "🔥 Monster",
    active: true,
    progress: {}
  },
  {
    id: "zemma",
    name: "Zemma",
    users: [CONFIG.USER_A, CONFIG.USER_C],
    channelId: CONFIG.CHANNEL_ZEMMA,
    streak: 420,
    day: 1,
    lastCompleted: Date.now(),
    reminderSent: false,
    badge: "🔥 Monster",
    active: true,
    progress: {}
  }
];

// Runtime state
let streaks = [];

// VC join time tracker: "streakId-userId" → timestamp (ms)
const vcJoinTimes = {};

// Midnight reset guard — stores "YYYY-MM-DD" of last reset
let lastResetDate = "";

// ============================================================
// MISSIONS (loops every 3 days)
// ============================================================
const MISSIONS = {
  1: [
    { key: "messages", type: "count", target: 10, desc: "💬 Kirim 10 pesan" },
    { key: "tiktok", type: "bool", desc: "🎵 Share 1 link TikTok" }
  ],
  2: [
    { key: "messages", type: "count", target: 15, desc: "💬 Kirim 15 pesan" },
    { key: "image", type: "bool", desc: "🖼️ Kirim 1 gambar" },
    { key: "emoji", type: "bool", desc: "😄 Kirim pesan berisi emoji" }
  ],
  3: [
    { key: "messages", type: "count", target: 5, desc: "💬 Kirim 5 pesan" },
    { key: "vc", type: "bool", desc: "🎙️ Join VC ≥ 5 menit" },
    { key: "longMsg", type: "bool", desc: "📝 Pesan ≥ 20 karakter" }
  ]
};

// ============================================================
// BADGES
// ============================================================
const BADGE_TIERS = [
  { min: 1000, label: "👑 Immortal" },
  { min: 700, label: "🌌 Beyond" },
  { min: 500, label: "⚡ Legend" },
  { min: 400, label: "🔥 Monster" }
];

function getBadge(count) {
  for (const t of BADGE_TIERS) {
    if (count >= t.min) return t.label;
  }
  return "✨ Warrior";
}

// ============================================================
// SAVE / LOAD
// ============================================================
function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(streaks, null, 2), "utf-8");
  } catch (err) {
    console.error("❌ Failed to save streak data:", err.message);
  }
}

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      streaks = JSON.parse(raw);

      // Ensure missing fields are initialized after load
      for (const s of streaks) {
        if (!s.badge) s.badge = getBadge(s.streak);
        if (s.active === undefined) s.active = true;
      }

      console.log(`📂 Streak data loaded (${streaks.length} streaks).`);
    } else {
      streaks = JSON.parse(JSON.stringify(DEFAULT_STREAKS));
      save();
      console.log("📂 Streak data file created with defaults.");
    }
  } catch (err) {
    console.error("❌ Failed to load streak data:", err.message);
    streaks = JSON.parse(JSON.stringify(DEFAULT_STREAKS));
  }
}

// ============================================================
// HELPERS
// ============================================================

/** Current 1–3 day (loops after day 3) */
function getDay(streak) {
  return ((streak.day - 1) % 3) + 1;
}

/** Returns ALL streaks a user belongs to (MUST use .filter) */
function getStreaksByUser(userId) {
  return streaks.filter(s => s.users.includes(userId));
}

/** Ensure every progress key exists for all users */
function initProgress(streak) {
  const p = streak.progress;
  const keys = ["messages", "tiktok", "image", "emoji", "longMsg", "vc"];
  for (const k of keys) {
    if (!p[k]) p[k] = {};
  }
  for (const uid of streak.users) {
    if (p.messages[uid] === undefined) p.messages[uid] = 0;
    if (p.tiktok[uid] === undefined) p.tiktok[uid] = false;
    if (p.image[uid] === undefined) p.image[uid] = false;
    if (p.emoji[uid] === undefined) p.emoji[uid] = false;
    if (p.longMsg[uid] === undefined) p.longMsg[uid] = false;
    if (p.vc[uid] === undefined) p.vc[uid] = false;
  }
}

/** Wipe all progress (called on completion / reset) */
function resetProgress(streak) {
  streak.progress = {};
  initProgress(streak);
}

/** Check if one user completed all missions for today */
function isUserDone(streak, userId) {
  const day = getDay(streak);
  const reqs = MISSIONS[day];
  const p = streak.progress;

  for (const r of reqs) {
    if (r.type === "count") {
      if ((p[r.key]?.[userId] || 0) < r.target) return false;
    } else {
      if (!p[r.key]?.[userId]) return false;
    }
  }
  return true;
}

/** Check if ALL users in the streak are done */
function isAllDone(streak) {
  return streak.users.every(uid => isUserDone(streak, uid));
}

// ============================================================
// SAFE CHANNEL RENAME
// ============================================================
async function renameChannel(channel, newName) {
  try {
    if (channel.name !== newName) {
      await channel.setName(newName);
      console.log(`📝 Channel renamed → ${newName}`);
    }
  } catch (err) {
    console.error(`❌ Channel rename failed: ${err.message}`);
  }
}

// ============================================================
// 📩 HANDLE STREAK MESSAGE
// ============================================================
async function handleStreakMessage(message) {
  if (message.author.bot) return;

  const userId = message.author.id;
  const content = message.content || "";

  // Anti-spam: ignore very short messages (allow attachments through)
  if (content.length < 3 && message.attachments.size === 0) return;

  // ── SHORT COMMANDS ─────────────────────────────────────────
  if (content === "!sl" || content === "!ssa" || content === "!ssz" ||
      content === "!sma" || content === "!smz") {
    await handleCommand(message, content);
    return;
  }

  const userStreaks = getStreaksByUser(userId);
  if (userStreaks.length === 0) return;

  // Resolve attachments safely
  const attachments = [...message.attachments.values()];

  for (const streak of userStreaks) {
    initProgress(streak);

    const day = getDay(streak);
    const p = streak.progress;

    // Count messages (only if content has ≥3 chars OR has attachment)
    if (content.length >= 3 || attachments.length > 0) {
      p.messages[userId] = (p.messages[userId] || 0) + 1;
    }

    // Day 1 — TikTok link
    if (day === 1) {
      if (!p.tiktok[userId] && content.includes("tiktok.com")) {
        p.tiktok[userId] = true;
      }
    }

    // Day 2 — image + emoji
    if (day === 2) {
      if (attachments.some(a => a.contentType?.startsWith("image/"))) {
        p.image[userId] = true;
      }
      // Safe emoji detection
      if (/\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(content)) {
        p.emoji[userId] = true;
      }
    }

    // Day 3 — long message
    if (day === 3) {
      if (content.length >= 20) {
        p.longMsg[userId] = true;
      }
    }
  }

  save();
}

// ============================================================
// 🎙️ HANDLE VOICE STATE UPDATE
// ============================================================
function handleVoiceUpdate(oldState, newState) {
  // Use newState.member.id (NOT newState.id)
  const userId = newState.member?.id;
  if (!userId) return;

  const userStreaks = getStreaksByUser(userId);
  if (userStreaks.length === 0) return;

  for (const streak of userStreaks) {
    if (getDay(streak) !== 3) continue;

    const key = `${streak.id}-${userId}`;

    // Joined a VC
    if (!oldState.channelId && newState.channelId) {
      vcJoinTimes[key] = Date.now();
      console.log(`🎙️ [${streak.id}] ${userId} joined VC`);
    }

    // Left a VC
    if (oldState.channelId && !newState.channelId) {
      const joinedAt = vcJoinTimes[key];
      if (joinedAt) {
        const minutes = (Date.now() - joinedAt) / 60000;
        if (minutes >= 5) {
          initProgress(streak);
          streak.progress.vc[userId] = true;
          save();
          console.log(`✅ [${streak.id}] ${userId} completed VC (${minutes.toFixed(1)} min)`);
        }
        delete vcJoinTimes[key];
      }
    }
  }
}

// ============================================================
// ⏰ STREAK TIMER LOOP — TikTok Style
// ============================================================
function startStreakLoop(client) {
  load();

  setInterval(async () => {
    const now = new Date();
    // Build today's date string in local time (YYYY-MM-DD)
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const isMidnight = now.getHours() === 0 && now.getMinutes() === 0;

    // ── MIDNIGHT RESET (once per day) ────────────────────────
    if (isMidnight && lastResetDate !== todayStr) {
      lastResetDate = todayStr;

      for (const streak of streaks) {
        initProgress(streak);
        resetProgress(streak);
        streak.active = false;
        streak.reminderSent = false;
        save();

        let ch = null;
        try { ch = client.channels.cache.get(streak.channelId) || await client.channels.fetch(streak.channelId); } catch { }

        if (ch) {
          const mentions = streak.users.map(u => `<@${u}>`).join(" ");
          await ch.send({
            content: mentions,
            embeds: [
              new EmbedBuilder()
                .setTitle("⚠️ Streak Needs Activation!")
                .setDescription(
                  `**${streak.name}** — hari baru dimulai!\n\n` +
                  `🔥 Streak saat ini: **${streak.streak}**\n` +
                  `📅 Day: **${getDay(streak)}**\n\n` +
                  `⚠️ Selesaikan misi hari ini untuk mengaktifkan streak!`
                )
                .setColor(0xffa500)
                .setTimestamp()
            ]
          });
          await renameChannel(ch, `⚠️・${streak.id}-${streak.streak}`);
        }
      }
    }

    // ── PER-STREAK CHECKS ────────────────────────────────────
    for (const streak of streaks) {
      initProgress(streak);

      let ch = null;
      try { ch = client.channels.cache.get(streak.channelId) || await client.channels.fetch(streak.channelId); } catch { }

      const mentions = streak.users.map(u => `<@${u}>`).join(" ");

      // ── ACTIVATION: all missions done + not yet active today ──
      if (isAllDone(streak) && streak.active === false) {
        streak.streak++;
        streak.day++;
        streak.active = true;
        streak.lastCompleted = Date.now();
        streak.reminderSent = false;

        const oldBadge = streak.badge || getBadge(streak.streak - 1);
        const newBadge = getBadge(streak.streak);
        streak.badge = newBadge;
        resetProgress(streak);
        save();

        if (ch) {
          await ch.send({
            content: `${mentions} 🎉`,
            embeds: [
              new EmbedBuilder()
                .setTitle("🔥 STREAK ACTIVATED! +1")
                .setDescription(
                  `**${streak.name}** streak berhasil diaktifkan!\n\n` +
                  `🔥 **Streak:** ${streak.streak}\n` +
                  `📅 **Next Day:** Day ${getDay(streak)}\n` +
                  `🏆 **Badge:** ${newBadge}`
                )
                .setColor(0x00ff88)
                .setTimestamp()
            ]
          });

          // Badge upgrade notification
          if (newBadge !== oldBadge) {
            await ch.send({
              content: mentions,
              embeds: [
                new EmbedBuilder()
                  .setTitle("🏆 BADGE UPGRADE!")
                  .setDescription(`${oldBadge} → **${newBadge}**\n🔥 Streak: **${streak.streak}**`)
                  .setColor(0xffd700)
                  .setTimestamp()
              ]
            });
          }

          await renameChannel(ch, `🔥・${streak.id}-${streak.streak}`);
        }
        continue;
      }

      // ── FAIL: 24h passed without activation ──────────────────
      if (streak.active === false) {
        const elapsed = Date.now() - streak.lastCompleted;
        const hours = elapsed / 3_600_000;

        if (hours >= 24) {
          const oldStreak = streak.streak;
          streak.streak = 0;
          streak.day = 1;
          streak.active = false;
          streak.lastCompleted = Date.now();
          streak.reminderSent = false;
          streak.badge = getBadge(0);
          resetProgress(streak);
          save();

          if (ch) {
            await ch.send({
              content: `${mentions} 💀`,
              embeds: [
                new EmbedBuilder()
                  .setTitle("💀 STREAK LOST!")
                  .setDescription(
                    `**${streak.name}** gagal mengaktifkan streak!\n\n` +
                    `**Was:** ${oldStreak}\n` +
                    `**Now:** 0\n\n` +
                    `😤 Mulai dari awal lagi...`
                  )
                  .setColor(0xff0000)
                  .setTimestamp()
              ]
            });
            await renameChannel(ch, `💀・${streak.id}-0`);
          }
          continue;
        }

        // ── WARNING: 18h passed, not activated, not reminded ────
        if (hours >= 18 && !streak.reminderSent) {
          streak.reminderSent = true;
          save();

          if (ch) {
            const deadlineTs = Math.floor((streak.lastCompleted + 86_400_000) / 1000);
            await ch.send({
              content: `🔥 WOI ${mentions} streak mau mati jir!`,
              embeds: [
                new EmbedBuilder()
                  .setTitle("⚠️ STREAK WARNING!")
                  .setDescription(
                    `🔥 WOI ${mentions} streak mau mati jir!\n\n` +
                    `**${streak.name}** — Streak: **${streak.streak}**\n` +
                    `⏰ Deadline: <t:${deadlineTs}:R>`
                  )
                  .setColor(0xff4500)
                  .setTimestamp()
              ]
            });
          }
        }
      }
    }
  }, 60_000);

  console.log("⏰ Streak loop started (TikTok style, 60s interval).");
}

// ============================================================
// 🧪 COMMANDS — short aliases
// !sl !ssa !ssz !sma !smz
// ============================================================
async function handleCommand(message, cmd) {

  // !sl — list all streaks
  if (cmd === "!sl") {
    const fields = streaks.map(s => {
      const badge = s.badge || getBadge(s.streak);
      const stateIcon = s.active ? "🔥" : "⚠️";
      const stateLabel = s.active ? "Activated" : "Needs Activation";
      return {
        name: `${badge} — ${s.name}`,
        value:
          `🆔 \`${s.id}\`\n` +
          `🔥 Streak: **${s.streak}**\n` +
          `📅 Day: **${getDay(s)}**\n` +
          `${stateIcon} Status: **${stateLabel}**\n` +
          `👥 ${s.users.map(u => `<@${u}>`).join(", ")}`,
        inline: true
      };
    });

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🔥 All Active Streaks")
          .addFields(fields)
          .setColor(0xff6600)
          .setFooter({ text: "!ssa | !ssz untuk detail" })
          .setTimestamp()
      ]
    });
  }

  // Shared helper: build status embed for a streak
  function buildStatus(s) {
    initProgress(s);
    const day = getDay(s);
    const reqs = MISSIONS[day];
    const resetTs = Math.floor((s.lastCompleted + 86_400_000) / 1000);

    let progressText = "";
    for (const uid of s.users) {
      const done = isUserDone(s, uid);
      progressText += `${done ? "✅" : "⏳"} <@${uid}>\n`;
      for (const r of reqs) {
        const cur = r.type === "count"
          ? `${s.progress[r.key]?.[uid] || 0}/${r.target}`
          : (s.progress[r.key]?.[uid] ? "✅ Done" : "❌ Belum");
        const tick = (r.type === "count")
          ? ((s.progress[r.key]?.[uid] || 0) >= r.target ? "✅" : "❌")
          : (s.progress[r.key]?.[uid] ? "✅" : "❌");
        progressText += `  └ ${tick} ${r.desc} ${r.type === "count" ? `(${cur})` : ""}\n`;
      }
      progressText += "\n";
    }

    const stateIcon = s.active ? "🔥 Activated" : "⚠️ Needs Activation";

    return new EmbedBuilder()
      .setTitle(`📊 Status — ${s.name}`)
      .setDescription(
        `🔥 Streak: **${s.streak}** | 📅 Day ${day} | 🏆 ${s.badge || getBadge(s.streak)}\n` +
        `${stateIcon} | ⏰ Deadline: <t:${resetTs}:R>\n\n` +
        progressText
      )
      .setColor(s.active ? 0x00ff88 : isAllDone(s) ? 0xffa500 : 0xff6600)
      .setTimestamp();
  }

  // Shared helper: build mission embed for a streak
  function buildMission(s) {
    const day = getDay(s);
    const reqs = MISSIONS[day];
    const list = reqs.map((r, i) => {
      const extra = r.type === "count" ? ` (target: **${r.target}**)` : "";
      return `**${i + 1}.** ${r.desc}${extra}`;
    }).join("\n");

    return new EmbedBuilder()
      .setTitle(`🎯 Mission — ${s.name}`)
      .setDescription(`📅 **Day ${day}**\n\n${list}\n\n👥 Semua user harus menyelesaikan semua misi!`)
      .setColor(0x7c4dff)
      .setFooter({ text: `Streak: ${s.streak} | ${s.badge || getBadge(s.streak)}` })
      .setTimestamp();
  }

  // !ssa — status azzura
  if (cmd === "!ssa") {
    const s = streaks.find(x => x.id === "azzura");
    if (!s) return message.reply("❌ Streak azzura tidak ditemukan!");
    return message.reply({ embeds: [buildStatus(s)] });
  }

  // !ssz — status zemma
  if (cmd === "!ssz") {
    const s = streaks.find(x => x.id === "zemma");
    if (!s) return message.reply("❌ Streak zemma tidak ditemukan!");
    return message.reply({ embeds: [buildStatus(s)] });
  }

  // !sma — mission azzura
  if (cmd === "!sma") {
    const s = streaks.find(x => x.id === "azzura");
    if (!s) return message.reply("❌ Streak azzura tidak ditemukan!");
    return message.reply({ embeds: [buildMission(s)] });
  }

  // !smz — mission zemma
  if (cmd === "!smz") {
    const s = streaks.find(x => x.id === "zemma");
    if (!s) return message.reply("❌ Streak zemma tidak ditemukan!");
    return message.reply({ embeds: [buildMission(s)] });
  }
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
  handleStreakMessage,
  handleVoiceUpdate,
  startStreakLoop,
  streaks
};
