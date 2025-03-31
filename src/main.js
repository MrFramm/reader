const config = {
  type: Phaser.AUTO,
  width: 1000,
  height: 900,
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};
const game = new Phaser.Game(config);
let cards = [];
let currentWord = '';
let score = 0;
let words = [];
let cardWidth = 200;
let cardHeight = 300;
let okSnd = null;
let failSnd = null;
let scoreText = null;
let victoryText = null;

// Declare hintButtons globally so it can be accessed by the moved functions
let hintButtons = [];

function preload() {
  this.load.audio('ok', 'assets/audio/good.mp3');
  this.load.audio('fail', 'assets/audio/wrong.mp3');
  this.load.image('background', 'assets/bg.webp');
  this.load.image('speaker', 'assets/speaker.svg'); // Speaker icon for replay button
  console.log("Preloading JSON file...");
  this.load.json('words', 'assets/words.json'); // Load the JSON file containing words and audio paths
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
${hint.cooldown > 0 ? `${hint.cooldown}s` : ''}`);
      if (hint.cooldown <= 0) {
        hint.active = true; // Enable the button after cooldown
        hint.button.setInteractive();
        timer.remove(); // Stop the timer
      }
    },
    loop: true
  });
}

function resetAllInvisibleHintButtons(scene) {
  hintButtons.forEach(hint => {
    if (isHintButtonDeactivated(hint)) {
      resetButton(hint, scene);
    }
  });
}

function create() {
  okSnd = this.sound.add('ok');
  failSnd = this.sound.add('fail');
  // Add background image
  const backgroundImage = this.add.image(0, 0, 'background').setOrigin(0, 0);
  const texture = this.textures.get('background');
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
  console.log("Loading words from JSON...");
  const wordAudioMap = this.cache.json.get('words');
  words = Object.keys(wordAudioMap);
  // Preload audio files dynamically
  Object.entries(wordAudioMap).forEach(([word, audioPath]) => {
    this.load.audio(word, audioPath);
  });
  // Start the game logic after preloading is complete
  this.load.once('complete', () => {
    console.log("All audio files preloaded successfully!");
    // Create the score text in the top-left corner of the screen
    scoreText = this.add.text(20, 20, `Score: ${score}`, {
      fontSize: '32px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 10, y: 5 }
    });
    // Create the Replay Button (Speaker Icon)
    const replayButton = this.add.image(
      this.sys.game.config.width - 80,
      40,
      'speaker'
    )
      .setScale(1)
      .setInteractive({ useHandCursor: true });
    replayButton.on('pointerover', () => replayButton.setScale(1.6));
    replayButton.on('pointerout', () => replayButton.setScale(1));
    replayButton.on('pointerdown', () => {
      if (currentWord) {
        console.log(`Replaying sound for word: ${currentWord}`);
        const audio = this.sound.add(currentWord);
        audio.play();
      }
    });
    // Create Hint Buttons
    const hintCooldowns = [60, 30, 15]; // Cooldown times for hints
    const hintCardCounts = [0, 1, 3]; // Number of wrong cards left after hint
    hintCooldowns.forEach((cooldown, index) => {
      const hintButton = this.add.text(
        this.sys.game.config.width / 2 - 150 + index * 100,
        40,
        `Помощь ${index + 1}
${cooldown}s`,
        {
          fontSize: '18px',
          color: '#000000',
          backgroundColor: ['#00FF00', '#FFFF00', '#FF0000'][index],
          padding: { x: 10, y: 5 },
          align: 'center'
        }
      )
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });
      hintButton.disableInteractive();
      hintButtons.push({ button: hintButton, cooldown: cooldown, active: false, originalCooldown: cooldown });
    });
    // Handle hint button clicks
    hintButtons.forEach((hint, index) => {
      hint.button.on('pointerdown', () => {
        if (!hint.active) return;
        // Remove wrong cards based on the hint
        const correctCards = cards.filter(card => card.text.text === currentWord);
        const wrongCards = cards.filter(card => card.text.text !== currentWord);
        const cardsToLeave = hintCardCounts[index];
        const cardsToRemove = wrongCards.slice(0, wrongCards.length - cardsToLeave);
        cardsToRemove.forEach(card => {
          card.background.destroy();
          card.text.destroy();
        });
        cards = cards.filter(card => !cardsToRemove.includes(card));
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
          loop: true
        });
      });
    });
    // Start cooldown countdown for all hint buttons
    hintButtons.forEach(hint => {
      const timer = this.time.addEvent({
        delay: 1000,
        callback: () => {
          hint.cooldown -= 1;
          hint.button.setText(`Помощь ${hintButtons.indexOf(hint) + 1}
${hint.cooldown > 0 ? `${hint.cooldown}s` : ''}`);
          if (hint.cooldown <= 0) {
            hint.active = true;
            hint.button.setInteractive();
            timer.remove();
          }
        },
        loop: true
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
    console.log(`Correct! Score: ${score}`);
    scoreText.setText(`Score: ${score}`);
    if (score >= 500) {
      endGame(scene, "Победа!");
      return;
    }
    disableCards();
    clearCards(scene);
    // Reset all invisible hint buttons
    resetAllInvisibleHintButtons(scene);
    scene.time.delayedCall(1000, () => {
      generateCardGrid(scene);
      selectRandomWord(scene);
      enableCards();
    });
  } else {
    failSnd.play();
    if (score > 0) score -= 5;
    console.log(`Wrong! Score: ${score}`);
    scoreText.setText(`Score: ${score}`);
    const cardIndex = cards.findIndex(card => card.background === cardBackground);
    if (cardIndex !== -1) {
      cards[cardIndex].background.destroy();
      cards[cardIndex].text.destroy();
      cards.splice(cardIndex, 1);
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
      const cardBackground = scene.add.rectangle(
        x + cardWidth / 2,
        y + cardHeight / 2,
        cardWidth,
        cardHeight,
        0xffffff
      );
      const cardText = scene.add.text(x, y, word, {
        fontFamily: '"Roboto", sans-serif',
        fontSize: '96px',
        color: '#000000',
        align: 'center',
        wordWrap: { width: cardWidth - 20 }
      })
        .setOrigin(0.5, 0.5)
        .setPosition(x + cardWidth / 2, y + cardHeight / 2);
      cardBackground.setInteractive({ useHandCursor: true });
      cardBackground.on('pointerdown', () => handleCardClick(scene, cardBackground, word));
      cards.push({ background: cardBackground, text: cardText });
    }
  }
}

function clearCards(scene) {
  cards.forEach(card => {
    card.background.destroy();
    card.text.destroy();
  });
  cards = [];
}

function disableCards() {
  cards.forEach(card => card.background.disableInteractive());
}

function enableCards() {
  cards.forEach(card => card.background.setInteractive({ useHandCursor: true }));
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
  victoryText = scene.add.text(
    scene.sys.game.config.width / 2,
    scene.sys.game.config.height / 2,
    message,
    {
      fontSize: '96px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 20, y: 10 }
    }
  )
    .setOrigin(0.5, 0.5);
  scene.sound.stopAll();
  disableCards();
}