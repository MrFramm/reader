const config = {
  type: Phaser.AUTO,
  width: 1000,
  height: 900,
  scene: {
    preload: preload,
    create: create,
    update: update,
  },
};
const game = new Phaser.Game(config);
let cards = [];
let currentWord = "";
let score = 0;
let words = [];
let cardWidth = 200;
let cardHeight = 300;
let okSnd = null;
let failSnd = null;
let scoreText = null;
let victoryText = null;
let codeDigits = [];
let codeText = null;
let sWords; // words that open code

// Declare hintButtons globally so it can be accessed by the moved functions
let hintButtons = [];

function preload() {
  this.load.audio("ok", "assets/audio/good.mp3");
  this.load.audio("fail", "assets/audio/wrong.mp3");
  this.load.audio("win", "assets/audio/win.wav");
  this.load.audio("over", "assets/audio/over.wav");
  this.load.audio("scream", "assets/audio/women_scream.mp3");
  this.load.image("background", "assets/bg.webp");
  this.load.image("lost", "assets/lost.png");
  this.load.video("hiddenVideo", "assets/rabid.mp4");
  this.load.image("speaker", "assets/speaker.svg"); // Speaker icon for replay button
  this.load.json("words", "assets/words.json"); // Load the JSON file containing words and audio paths
}

// Moved functions to global scope
function isHintButtonDeactivated(hint) {
  return !hint.button.visible;
}

function resetButton(hint, scene) {
  // Check if the button is already deactivated (invisible)
  if (!isHintButtonDeactivated(hint)) {
    console.log("The button is already active (visible). No need to reset.");
    return;
  }
  // Make the button visible and interactive
  hint.button.setVisible(true);
  hint.button.setInteractive();
  // Reset the cooldown time
  hint.cooldown = hint.originalCooldown;
  hint.active = false;
  // Update the button text to show the new cooldown time
  hint.button.setText(`Помощь ${hintButtons.indexOf(hint) + 1}
${hint.cooldown}s`);
  // Start the cooldown timer
  const timer = scene.time.addEvent({
    delay: 1000,
    callback: () => {
      hint.cooldown -= 1;
      hint.button.setText(`Помощь ${hintButtons.indexOf(hint) + 1}
${hint.cooldown > 0 ? `${hint.cooldown}s` : ""}`);
      if (hint.cooldown <= 0) {
        hint.active = true; // Enable the button after cooldown
        hint.button.setInteractive();
        timer.remove(); // Stop the timer
      }
    },
    loop: true,
  });
}

function resetAllInvisibleHintButtons(scene) {
  hintButtons.forEach((hint) => {
    if (isHintButtonDeactivated(hint)) {
      resetButton(hint, scene);
    }
  });
}

function create() {
  window.sc = this;
  // Clear global arrays and destroy old objects
  cards.forEach((card) => {
    if (card.background && card.background.destroy) card.background.destroy();
    if (card.text && card.text.destroy) card.text.destroy();
  });
  cards = [];

  hintButtons.forEach((hint) => {
    if (hint.button && hint.button.destroy) hint.button.destroy();
  });
  hintButtons = [];

  if (scoreText && scoreText.destroy) scoreText.destroy();
  scoreText = null;

  if (victoryText && victoryText.destroy) victoryText.destroy();
  victoryText = null;
  score = 0;
  okSnd = this.sound.add("ok");
  failSnd = this.sound.add("fail");
  // Add background image
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
    (this.sys.game.config.height - imageHeight * scale) / 2
  );
  this.backgroundImage = backgroundImage;
  console.log("Loading words from JSON...");
  const wordAudioMap = this.cache.json.get("words");
  words = Object.keys(wordAudioMap);
  // Preload audio files dynamically
  Object.entries(wordAudioMap).forEach(([word, audioPath]) => {
    this.load.audio(word, audioPath);
  });
  const s = minSuccessfulWords(words, 4, 0.7, 50);
  let wPool = [...words];
  Phaser.Utils.Array.Shuffle(wPool);
  sWords = wPool.slice(0, s);

  console.log(sWords);
  // Start the game logic after preloading is complete
  this.load.once("complete", () => {
    console.log("All audio files preloaded successfully!");
    // Create the score text in the top-left corner of the screen
    scoreText = this.add.text(20, 20, `Счёт: ${score}`, {
      fontSize: "32px",
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 10, y: 5 },
    });
    codeDigits = [];
    if (codeText) {
      codeText.destroy();
      codeText = null;
    }
    codeText = this.add
      .text(this.sys.game.config.width * 0.65, 20, "Код: ", {
        fontSize: "32px",
        color: "#FFFFFF",
        backgroundColor: "#000000",
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0, 0);

    // Create the Replay Button (Speaker Icon)
    const replayButton = this.add
      .image(this.sys.game.config.width - 80, 40, "speaker")
      .setScale(1)
      .setInteractive({ useHandCursor: true });
    replayButton.on("pointerover", () => replayButton.setScale(1.6));
    replayButton.on("pointerout", () => replayButton.setScale(1));
    replayButton.on("pointerdown", () => {
      if (currentWord) {
        console.log(`Replaying sound for word: ${currentWord}`);
        const audio = this.sound.add(currentWord);
        audio.play();
      }
    });
    // Create Hint Buttons
    const hintCooldowns = [130, 33, 16]; // Cooldown times for hints
    const hintCardCounts = [0, 1, 3]; // Number of wrong cards left after hint
    hintCooldowns.forEach((cooldown, index) => {
      const hintButton = this.add
        .text(
          this.sys.game.config.width / 2 - 150 + index * 100,
          40,
          `Помощь ${index + 1}
${cooldown}s`,
          {
            fontSize: "18px",
            color: "#000000",
            backgroundColor: ["#00FF00", "#FFFF00", "#FF0000"][index],
            padding: { x: 10, y: 5 },
            align: "center",
          }
        )
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });
      hintButton.disableInteractive();
      hintButtons.push({
        button: hintButton,
        cooldown: cooldown,
        active: false,
        originalCooldown: cooldown,
      });
    });
    // Handle hint button clicks
    hintButtons.forEach((hint, index) => {
      hint.button.on("pointerdown", () => {
        playWord(this);
        if (!hint.active) return;
        // Remove wrong cards based on the hint
        const correctCards = cards.filter(
          (card) => card.text.text === currentWord
        );
        const wrongCards = cards.filter(
          (card) => card.text.text !== currentWord
        );
        const cardsToLeave = hintCardCounts[index];
        const cardsToRemove = wrongCards.slice(
          0,
          wrongCards.length - cardsToLeave
        );
        cardsToRemove.forEach((card) => {
          card.background.destroy();
          card.text.destroy();
        });
        cards = cards.filter((card) => !cardsToRemove.includes(card));
        // Hide the hint button and deactivate it
        hint.active = false;
        hint.button.setVisible(false); // Make the button invisible
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
    // Start cooldown countdown for all hint buttons
    hintButtons.forEach((hint) => {
      const timer = this.time.addEvent({
        delay: 1000,
        callback: () => {
          hint.cooldown -= 1;
          hint.button.setText(`Помощь ${hintButtons.indexOf(hint) + 1}
${hint.cooldown > 0 ? `${hint.cooldown}s` : ""}`);
          if (hint.cooldown <= 0) {
            hint.active = true;
            hint.button.setInteractive();
            timer.remove();
          }
        },
        loop: true,
      });
    });
    generateCardGrid(this);
    selectRandomWord(this);
    // Generate the initial card grid
    generateCardGrid(this);
    selectRandomWord(this);
  });
  this.load.start();
}

function update() {
  // Update logic (if needed)
}

// Modify the handleCardClick function to reset invisible hint buttons
function handleCardClick(scene, cardBackground, word) {
  if (word === currentWord) {
    okSnd.play();
    score += 10;
    scoreText.setText(`Счёт: ${score}`);
    // Add new digit logic
    if (codeDigits.length < 4 && sWords.includes(word)) {
      // Choose a new digit to add — here, for example, a random digit 0-9
      const newDigit = Phaser.Math.Between(0, 9);
      codeDigits.push(newDigit);
      codeText.setText(`Код: ${codeDigits.join("")}`);
    }
    if (score >= 500) {
      endGame(scene, "Победа!");
      return;
    }
    disableCards();
    clearCards(scene);
    resetAllInvisibleHintButtons(scene);
    scene.time.delayedCall(1000, () => {
      generateCardGrid(scene);
      selectRandomWord(scene);
      enableCards();
    });
  } else {
    failSnd.play();
    if (score > 0) score -= 5;
    else score = -5; // Prevent repeated decrement, immediately negative
    scoreText.setText(`Score: ${score}`);
    const cardIndex = cards.findIndex(
      (card) => card.background === cardBackground
    );
    if (cardIndex !== -1) {
      cards[cardIndex].background.destroy();
      cards[cardIndex].text.destroy();
      cards.splice(cardIndex, 1);
    }
    // LOSE CONDITION: If score is negative, end the game
    if (score < 0) {
      endGame(scene, "Вы проиграли!");
      return;
    }
  }
}

function generateCardGrid(scene) {
  clearCards(scene);
  const rows = 2;
  const cols = 4;
  const totalWidth = scene.sys.game.config.width;
  const totalHeight = scene.sys.game.config.height;
  const horizontalMargin = (totalWidth - cols * cardWidth) / (cols + 1);
  const verticalMargin = (totalHeight - rows * cardHeight) / (rows + 1);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = horizontalMargin + col * (cardWidth + horizontalMargin);
      const y = verticalMargin + row * (cardHeight + verticalMargin);
      const word = words[Math.floor(Math.random() * words.length)];
      const maxWidth = cardWidth - 20;
      const minFontSize = 24; // Minimum readable font size
      const cardBackground = scene.add.rectangle(
        x + cardWidth / 2,
        y + cardHeight / 2,
        cardWidth,
        cardHeight,
        0xffffff
      );
      const cardText = scene.add
        .text(x, y, word, {
          fontFamily: '"Roboto", sans-serif',
          fontSize: "96px",
          color: "#000000",
          align: "center",
          wordWrap: { width: cardWidth - 20 },
        })
        .setOrigin(0.5, 0.5)
        .setPosition(x + cardWidth / 2, y + cardHeight / 2);
      if (cardText.width > maxWidth) {
        // Calculate scale ratio (current width vs max allowed width)
        const scaleRatio = maxWidth / cardText.width;
        // Apply new font size (ensure it doesn't go below minimum)
        const newFontSize = Math.max(minFontSize, 96 * scaleRatio);
        cardText.setFontSize(newFontSize);
      }
      cardBackground.setInteractive({ useHandCursor: true });
      cardBackground.on("pointerdown", () =>
        handleCardClick(scene, cardBackground, word)
      );
      cards.push({ background: cardBackground, text: cardText });
    }
  }
}

function clearCards(scene) {
  cards.forEach((card) => {
    card.background.destroy();
    card.text.destroy();
  });
  cards = [];
}

function disableCards() {
  cards.forEach((card) => card.background.disableInteractive());
}

function enableCards() {
  cards.forEach((card) =>
    card.background.setInteractive({ useHandCursor: true })
  );
}

function selectRandomWord(scene) {
  const randomCard = cards[Math.floor(Math.random() * cards.length)];
  currentWord = randomCard.text.text;
  console.log(`Selected word: ${currentWord}`);
  scene.sound.stopAll();
  const audio = scene.sound.add(currentWord);
  audio.play();
}

function endGame(scene, message) {
  clearCards(scene);
  scene.sound.stopAll();

  // Remove code text
  if (codeText) {
    codeText.destroy();
    codeText = null;
  }

  if (message === "Победа!") {
    scene.sound.play("win");
    victoryText = scene.add
      .text(
        scene.sys.game.config.width / 2,
        scene.sys.game.config.height / 2,
        message,
        {
          fontSize: "96px",
          color: "#ffffff",
          backgroundColor: "#000000",
          padding: { x: 20, y: 10 },
        }
      )
      .setOrigin(0.5, 0.5);
    disableCards();
    if (codeDigits.length === 4) showPinInput(scene, codeDigits.join(""));
  } else {
    // Game Over flow
    // Change background to 'lost' image
    scene.backgroundImage.destroy();
    const lostBG = scene.add.image(0, 0, "lost").setOrigin(0, 1);
    const tex = scene.textures.get("lost");
    const imageWidth = tex.getSourceImage().width;
    const imageHeight = tex.getSourceImage().height;
    const scaleX = scene.sys.game.config.width / imageWidth;
    const scaleY = scene.sys.game.config.height / imageHeight;
    const scale = Math.min(scaleX, scaleY);
    lostBG.setScale(scale);
    lostBG.setPosition(
      (scene.sys.game.config.width - imageWidth * scale) / 2,
      scene.sys.game.config.height
    );

    // Play lost sound
    const sound = scene.sound.add("over");
    sound.play();

    // Show Game Over text on top
    victoryText = scene.add
      .text(
        scene.sys.game.config.width / 2,
        scene.sys.game.config.height / 3,
        message,
        {
          fontSize: "96px",
          color: "#ffffff",
          backgroundColor: "#000000",
          padding: { x: 20, y: 10 },
        }
      )
      .setOrigin(0.5, 0.5);

    disableCards();

    // When lost sound finishes, restart the game
    sound.once("complete", () => {
      scene.scene.restart();
      score = 0; // Optionally reset score here
    });
  }
}

function playWord(scene) {
  if (currentWord) {
    console.log(`Replaying sound for word: ${currentWord}`);
    const audio = scene.sound.add(currentWord);
    audio.play();
  }
}
function showPinInput(scene, code) {
  const gameCanvas = scene.sys.game.canvas;
  const rect = gameCanvas.getBoundingClientRect();

  // Create a container div for inputs
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
  pinContainer.style.background = "rgba(0,0,0,0.5)"; // optional to shade the background

  const inputs = [];
  for (let i = 0; i < 4; i++) {
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

    // Automatically move to the next input when typing
    input.addEventListener("input", () => {
      if (input.value.length === 1 && i < 3) {
        inputs[i + 1].focus();
      }
      checkPin(code);
    });

    // Handle backspace to focus previous input
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && input.value.length === 0 && i > 0) {
        inputs[i - 1].focus();
      }
    });

    inputs.push(input);
    pinContainer.appendChild(input);
  }

  document.body.appendChild(pinContainer);
  inputs[0].focus();

  function checkPin(code) {
    const enteredPin = inputs.map((i) => i.value).join("");
    if (enteredPin.length === 4) {
      if (enteredPin === code) {
        const video = scene.add
          .video(
            scene.sys.game.config.width / 2,
            scene.sys.game.config.height / 2,
            "hiddenVideo"
          )
          .setOrigin(0.5)
          .setDepth(20);

        // Play the video (must be triggered by user interaction due to browser policies)
        video.play();

        // Remove input fields
        document.body.removeChild(pinContainer);
        //scene.sound.play("scream");
      } else {
        // Clear inputs and refocus first input
        inputs.forEach((i) => (i.value = ""));
        inputs[0].focus();
      }
    }
  }
}

function factorial(n) {
  if (n === 0 || n === 1) return 1;
  let val = 1;
  for (let i = 2; i <= n; i++) val *= i;
  return val;
}

function combinations(n, k) {
  if (k > n) return 0;
  return factorial(n) / (factorial(k) * factorial(n - k));
}

function binomialPMF(k, n, p) {
  return combinations(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

function binomialCumulativeAtLeast(k, n, p) {
  let sum = 0;
  for (let i = k; i <= n; i++) {
    sum += binomialPMF(i, n, p);
  }
  return sum;
}
/**
 * Find the minimum number of successful words in the word pool needed
 * to achieve a specified probability of getting at least T successful words
 * in N tries (with repetition allowed).
 *
 * @param {Array} words - Array of words representing the pool
 * @param {number} T - Target minimum number of successful words to get
 * @param {number} c - Desired probability (between 0 and 1) to achieve at least T successes
 * @param {number} N - Number of tries (words drawn, with replacement)
 * @returns {number|null} - Minimum number of successful words required in the pool to meet the probability,
 *                          or null if no number satisfies the condition
 */
function minSuccessfulWords(words, T, c, N) {
  const poolSize = words.length;
  for (let S = T; S <= poolSize; S++) {
    const p = S / poolSize;
    const prob = binomialCumulativeAtLeast(T, N, p);
    if (prob >= c) {
      return S;
    }
  }
  return null; // no suitable S found to reach probability c
}
