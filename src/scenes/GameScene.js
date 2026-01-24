import { minSuccessfulWords, markLevelComplete, LEVELS } from "../main.js";

export class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  init(data) {
    this.currentLevel = data.level || LEVELS[0]; // Fallback to level 1
  }

  preload() {
    this.load.audio("ok", "assets/audio/good.mp3");
    this.load.audio("fail", "assets/audio/wrong.mp3");
    this.load.audio("win", "assets/audio/win.wav");
    this.load.audio("over", "assets/audio/over.wav");
    this.load.audio("scream", "assets/audio/women_scream.mp3");
    this.load.image("background", "assets/bg.webp");
    this.load.image("lost", "assets/lost.png");
    this.load.video("hiddenVideo", `assets/ends/${this.currentLevel.id}.mp4`);
    console.log(`assets/ends/${this.currentLevel.id}.mp4`);
    this.load.image("speaker", "assets/speaker.svg");
    this.load.json("words", "assets/words.json");
  }

  create() {
    window.sc = this;
    this.runLevel();
  }

  runLevel() {
    // Clean up previous game state
    this.cleanup();

    const { targetScore, codeLength, wordPoolSize } = this.currentLevel;

    // Store level config
    this.targetScore = targetScore;
    this.codeLength = 4;

    // Load background
    const backgroundImage = this.add.image(0, 0, "background").setOrigin(0, 0);
    const texture = this.textures.get("background");
    const imageWidth = texture.getSourceImage().width;
    const imageHeight = texture.getSourceImage().height;
    const scaleX = this.sys.game.config.width / imageWidth;
    const scaleY = this.sys.game.config.height / imageHeight;
    const scale = Math.max(scaleX, scaleY);
    backgroundImage.setScale(scale);
    backgroundImage.setPosition(
      (this.sys.game.config.width - imageWidth * scale) / 2,
      (this.sys.game.config.height - imageHeight * scale) / 2,
    );
    this.backgroundImage = backgroundImage;

    // Load words
    const wordAudioMap = this.cache.json.get("words");
    let allWords = Object.keys(wordAudioMap);

    // Limit word pool per level
    if (allWords.length > wordPoolSize) {
      Phaser.Utils.Array.Shuffle(allWords);
      allWords = allWords.slice(0, wordPoolSize);
    }
    this.words = allWords;

    // Preload word audio
    this.words.forEach((word) => {
      const audioPath = wordAudioMap[word];
      this.load.audio(word, audioPath);
    });

    this.load.once("complete", () => {
      this.okSnd = this.sound.add("ok");
      this.failSnd = this.sound.add("fail");

      // UI Elements
      this.score = 0;
      this.scoreText = this.add.text(20, 20, `Счёт: ${this.score}`, {
        fontSize: "32px",
        color: "#ffffff",
        backgroundColor: "#000000",
        padding: { x: 10, y: 5 },
      });

      this.codeDigits = [];
      this.codeText = this.add
        .text(this.sys.game.config.width * 0.65, 20, "Код: ", {
          fontSize: "32px",
          color: "#FFFFFF",
          backgroundColor: "#000000",
          padding: { x: 10, y: 5 },
        })
        .setOrigin(0, 0);

      // Replay Button
      const replayButton = this.add
        .image(this.sys.game.config.width - 80, 40, "speaker")
        .setScale(1)
        .setInteractive({ useHandCursor: true });
      replayButton.on("pointerover", () => replayButton.setScale(1.6));
      replayButton.on("pointerout", () => replayButton.setScale(1));
      replayButton.on("pointerdown", () => {
        if (this.currentWord) {
          const audio = this.sound.add(this.currentWord);
          audio.play();
        }
      });

      // Hint Buttons
      const hintCooldowns = [130, 33, 16];
      const hintCardCounts = [0, 1, 3];
      this.hintButtons = [];

      hintCooldowns.forEach((cooldown, index) => {
        const hintButton = this.add
          .text(
            this.sys.game.config.width / 2 - 150 + index * 100,
            40,
            `Помощь ${index + 1}\n${cooldown}s`,
            {
              fontSize: "18px",
              color: "#000000",
              backgroundColor: ["#00FF00", "#FFFF00", "#FF0000"][index],
              padding: { x: 10, y: 5 },
              align: "center",
            },
          )
          .setOrigin(0.5, 0.5)
          .setInteractive({ useHandCursor: true })
          .disableInteractive();

        this.hintButtons.push({
          button: hintButton,
          cooldown: cooldown,
          active: false,
          originalCooldown: cooldown,
        });
      });

      // Hint button logic
      this.hintButtons.forEach((hint, index) => {
        hint.button.on("pointerdown", () => {
          this.playWord();
          if (!hint.active) return;

          const correctCards = this.cards.filter(
            (card) => card.text.text === this.currentWord,
          );
          const wrongCards = this.cards.filter(
            (card) => card.text.text !== this.currentWord,
          );
          const cardsToLeave = hintCardCounts[index];
          const cardsToRemove = wrongCards.slice(
            0,
            wrongCards.length - cardsToLeave,
          );

          cardsToRemove.forEach((card) => {
            card.background.destroy();
            card.text.destroy();
          });
          this.cards = this.cards.filter(
            (card) => !cardsToRemove.includes(card),
          );

          hint.active = false;
          hint.button.setVisible(false);
          hint.button.disableInteractive();

          let remainingCooldown = hint.cooldown;
          const timer = this.time.addEvent({
            delay: 1000,
            callback: () => {
              remainingCooldown -= 1;
              if (remainingCooldown <= 0) {
                hint.active = true;
                hint.button.setInteractive();
                timer.remove();
              }
            },
            loop: true,
          });
        });
      });

      // Start cooldown timers
      this.hintButtons.forEach((hint) => {
        const timer = this.time.addEvent({
          delay: 1000,
          callback: () => {
            hint.cooldown -= 1;
            hint.button.setText(
              `Помощь ${this.hintButtons.indexOf(hint) + 1}\n${
                hint.cooldown > 0 ? `${hint.cooldown}s` : ""
              }`,
            );
            if (hint.cooldown <= 0) {
              hint.active = true;
              hint.button.setInteractive();
              timer.remove();
            }
          },
          loop: true,
        });
      });

      // Determine successful words (for code)
      const s = minSuccessfulWords(this.words, 4, 0.7, 50);
      let wPool = [...this.words];
      Phaser.Utils.Array.Shuffle(wPool);
      this.sWords = wPool.slice(0, s);

      // Start gameplay
      this.generateCardGrid();
      this.selectRandomWord();
    });

    this.load.start();
  }

  cleanup() {
    // Destroy cards
    if (this.cards) {
      this.cards.forEach((card) => {
        if (card.background?.destroy) card.background.destroy();
        if (card.text?.destroy) card.text.destroy();
      });
    }
    this.cards = [];

    // Destroy hint buttons
    if (this.hintButtons) {
      this.hintButtons.forEach((hint) => {
        if (hint.button?.destroy) hint.button.destroy();
      });
    }
    this.hintButtons = [];

    // Destroy UI
    if (this.scoreText?.destroy) this.scoreText.destroy();
    if (this.codeText?.destroy) this.codeText.destroy();
    if (this.victoryText?.destroy) this.victoryText.destroy();
    if (this.backgroundImage?.destroy) this.backgroundImage.destroy();

    this.scoreText = null;
    this.codeText = null;
    this.victoryText = null;
  }

  generateCardGrid() {
    this.clearCards();
    const rows = 2;
    const cols = 4;
    const totalWidth = this.sys.game.config.width;
    const totalHeight = this.sys.game.config.height;
    const horizontalMargin = (totalWidth - cols * 200) / (cols + 1);
    const verticalMargin = (totalHeight - rows * 300) / (rows + 1);

    this.cards = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = horizontalMargin + col * (200 + horizontalMargin);
        const y = verticalMargin + row * (300 + verticalMargin);
        const word = this.words[Math.floor(Math.random() * this.words.length)];

        const cardBackground = this.add.rectangle(
          x + 100,
          y + 150,
          200,
          300,
          0xffffff,
        );

        const cardText = this.add
          .text(x + 100, y + 150, word, {
            fontFamily: '"Roboto", sans-serif',
            fontSize: "96px",
            color: "#000000",
            align: "center",
            wordWrap: { width: 180 },
          })
          .setOrigin(0.5);

        // Auto-scale text
        if (cardText.width > 180) {
          const scaleRatio = 180 / cardText.width;
          const newFontSize = Math.max(24, 96 * scaleRatio);
          cardText.setFontSize(newFontSize);
        }

        cardBackground.setInteractive({ useHandCursor: true });
        cardBackground.on("pointerdown", () =>
          this.handleCardClick(cardBackground, word),
        );

        this.cards.push({ background: cardBackground, text: cardText });
      }
    }
  }

  clearCards() {
    if (this.cards) {
      this.cards.forEach((card) => {
        card.background?.destroy();
        card.text?.destroy();
      });
      this.cards = [];
    }
  }

  disableCards() {
    this.cards.forEach((card) => card.background?.disableInteractive());
  }

  enableCards() {
    this.cards.forEach((card) =>
      card.background?.setInteractive({ useHandCursor: true }),
    );
  }

  selectRandomWord() {
    if (this.cards.length === 0) return;
    const randomCard =
      this.cards[Math.floor(Math.random() * this.cards.length)];
    this.currentWord = randomCard.text.text;
    this.sound.stopAll();
    const audio = this.sound.add(this.currentWord);
    audio.play();
  }

  playWord() {
    if (this.currentWord) {
      const audio = this.sound.add(this.currentWord);
      audio.play();
    }
  }

  handleCardClick(cardBackground, word) {
    if (word === this.currentWord) {
      this.okSnd.play();
      this.score += 10;
      this.scoreText.setText(`Счёт: ${this.score}`);

      if (
        this.codeDigits.length < this.codeLength &&
        this.sWords.includes(word)
      ) {
        const newDigit = Phaser.Math.Between(0, 9);
        this.codeDigits.push(newDigit);
        this.codeText.setText(`Код: ${this.codeDigits.join("")}`);
      }

      if (this.score >= this.targetScore) {
        markLevelComplete(this.currentLevel.id);
        this.endGame("Победа!");
        return;
      }

      this.disableCards();
      this.clearCards();
      this.resetAllInvisibleHintButtons();

      this.time.delayedCall(1000, () => {
        this.generateCardGrid();
        this.selectRandomWord();
        this.enableCards();
      });
    } else {
      this.failSnd.play();
      this.score = this.score > 0 ? this.score - 5 : -5;
      this.scoreText.setText(`Счёт: ${this.score}`);

      const cardIndex = this.cards.findIndex(
        (card) => card.background === cardBackground,
      );
      if (cardIndex !== -1) {
        this.cards[cardIndex].background.destroy();
        this.cards[cardIndex].text.destroy();
        this.cards.splice(cardIndex, 1);
      }

      if (this.score < 0) {
        this.endGame("Вы проиграли!");
      }
    }
  }

  resetAllInvisibleHintButtons() {
    this.hintButtons.forEach((hint) => {
      if (!hint.button.visible) {
        this.resetButton(hint);
      }
    });
  }

  resetButton(hint) {
    if (hint.button.visible) return;

    hint.button.setVisible(true);
    hint.button.setInteractive();
    hint.cooldown = hint.originalCooldown;
    hint.active = false;

    hint.button.setText(
      `Помощь ${this.hintButtons.indexOf(hint) + 1}\n${hint.cooldown}s`,
    );

    const timer = this.time.addEvent({
      delay: 1000,
      callback: () => {
        hint.cooldown -= 1;
        hint.button.setText(
          `Помощь ${this.hintButtons.indexOf(hint) + 1}\n${
            hint.cooldown > 0 ? `${hint.cooldown}s` : ""
          }`,
        );
        if (hint.cooldown <= 0) {
          hint.active = true;
          hint.button.setInteractive();
          timer.remove();
        }
      },
      loop: true,
    });
  }

  endGame(message) {
    this.clearCards();
    this.sound.stopAll();

    if (this.codeText) {
      this.codeText.destroy();
      this.codeText = null;
    }

    if (message === "Победа!") {
      this.sound.play("win");
      this.victoryText = this.add
        .text(
          this.sys.game.config.width / 2,
          this.sys.game.config.height / 2,
          message,
          {
            fontSize: "96px",
            color: "#ffffff",
            backgroundColor: "#000000",
            padding: { x: 20, y: 10 },
          },
        )
        .setOrigin(0.5);

      this.disableCards();

      if (this.codeDigits.length === this.codeLength) {
        this.showPinInput(this.codeDigits.join(""), () => {
          this.scene.start("StartScene");
        });
      } else {
        // Should not happen, but safe fallback
        this.time.delayedCall(2000, () => {
          this.scene.start("StartScene");
        });
      }
    } else {
      // Game Over
      this.backgroundImage.destroy();
      const lostBG = this.add.image(0, 0, "lost").setOrigin(0, 1);
      const tex = this.textures.get("lost");
      const imgW = tex.getSourceImage().width;
      const imgH = tex.getSourceImage().height;
      const scale = Math.min(
        this.sys.game.config.width / imgW,
        this.sys.game.config.height / imgH,
      );
      lostBG.setScale(scale);
      lostBG.setPosition(
        (this.sys.game.config.width - imgW * scale) / 2,
        this.sys.game.config.height,
      );

      const sound = this.sound.add("over");
      sound.play();

      this.victoryText = this.add
        .text(
          this.sys.game.config.width / 2,
          this.sys.game.config.height / 3,
          message,
          {
            fontSize: "96px",
            color: "#ffffff",
            backgroundColor: "#000000",
            padding: { x: 20, y: 10 },
          },
        )
        .setOrigin(0.5);

      this.disableCards();

      sound.once("complete", () => {
        this.scene.start("StartScene");
      });
    }
  }

  showPinInput(code, onComplete) {
    const gameCanvas = this.sys.game.canvas;
    const rect = gameCanvas.getBoundingClientRect();

    const pinContainer = document.createElement("div");
    pinContainer.style.position = "absolute";
    pinContainer.style.left = `${rect.left + window.scrollX}px`;
    pinContainer.style.top = `${rect.top + window.scrollY}px`;
    pinContainer.style.width = `${rect.width}px`;
    pinContainer.style.height = `${rect.height}px`;
    pinContainer.style.display = "flex";
    pinContainer.style.justifyContent = "center";
    pinContainer.style.alignItems = "center";
    pinContainer.style.gap = "15px";
    pinContainer.style.zIndex = 1000;
    pinContainer.style.background = "rgba(0,0,0,0.5)";

    const inputs = [];
    for (let i = 0; i < this.codeLength; i++) {
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 1;
      input.style.width = "70px";
      input.style.height = "70px";
      input.style.fontSize = "48px";
      input.style.textAlign = "center";
      input.style.borderRadius = "10px";
      input.style.border = "3px solid #fff";
      input.style.color = "#000";
      input.style.background = "#fff";
      input.autocomplete = "off";

      input.addEventListener("input", () => {
        if (input.value.length === 1 && i < this.codeLength - 1) {
          inputs[i + 1].focus();
        }
        checkPin();
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !input.value && i > 0) {
          inputs[i - 1].focus();
        }
      });

      inputs.push(input);
      pinContainer.appendChild(input);
    }

    document.body.appendChild(pinContainer);
    inputs[0].focus();

    const checkPin = () => {
      const entered = inputs.map((i) => i.value).join("");
      if (entered.length === this.codeLength) {
        if (entered === code) {
          const video = this.add
            .video(
              this.sys.game.config.width / 2,
              this.sys.game.config.height / 2,
              "hiddenVideo",
            )
            .setOrigin(0.5)
            .setDepth(20);
          document.body.removeChild(pinContainer);
          video.play();
          // When video finishes, go back to menu
          video.once("complete", () => {
            video.destroy();
            this.cache.video.remove("hiddenVideo");
            onComplete(); // ✅ Now called AFTER video ends
          });
        } else {
          inputs.forEach((i) => (i.value = ""));
          inputs[0].focus();
        }
      }
    };
  }
}
