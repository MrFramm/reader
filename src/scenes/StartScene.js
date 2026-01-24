import { getCompletedLevels, LEVELS } from "../main.js";

export class StartScene extends Phaser.Scene {
  constructor() {
    super("StartScene");
  }

  preload() {
    this.load.image("background", "assets/bg.webp");
  }

  create() {
    const bg = this.add.image(0, 0, "background").setOrigin(0, 0);
    const tex = this.textures.get("background");
    const imgW = tex.getSourceImage().width;
    const imgH = tex.getSourceImage().height;
    const scale = Math.max(
      this.sys.game.config.width / imgW,
      this.sys.game.config.height / imgH,
    );
    bg.setScale(scale);
    bg.setPosition(
      (this.sys.game.config.width - imgW * scale) / 2,
      (this.sys.game.config.height - imgH * scale) / 2,
    );

    this.add
      .text(this.sys.game.config.width / 2, 100, "Выберите уровень", {
        fontSize: "48px",
        color: "#ffffff",
        backgroundColor: "#000000",
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5);

    const completed = getCompletedLevels();

    LEVELS.forEach((level, index) => {
      const y = 200 + index * 100;

      // 🔑 Unlock rule: Level 1 is always unlocked.
      // Level N is unlocked only if Level (N-1) is completed.
      const isUnlocked = level.id === 1 || completed.includes(level.id - 1);

      const color = isUnlocked ? "#4a90e2" : "#666666";
      const text = `Уровень ${level.id}${isUnlocked ? "" : " 🔒"}`;

      const btn = this.add
        .text(this.sys.game.config.width / 2, y, text, {
          fontSize: "32px",
          color: "#000000",
          backgroundColor: color,
          padding: { x: 20, y: 10 },
        })
        .setOrigin(0.5);

      if (isUnlocked) {
        btn.setInteractive({ useHandCursor: true });
        btn.on("pointerdown", () => {
          this.scene.start("GameScene", { level: level });
        });
      }
    });
  }
}
