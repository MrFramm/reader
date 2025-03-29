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

// Variables for score text and victory message
let scoreText = null;
let victoryText = null;

function preload() {
  this.load.audio('ok', 'assets/audio/good.mp3');
  this.load.audio('fail', 'assets/audio/wrong.mp3');
  this.load.image('background', 'assets/bg.webp');
  console.log("Preloading JSON file...");
  this.load.json('words', 'assets/words.json'); // Load the JSON file containing words and audio paths
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
      backgroundColor: '#000000', // Optional: Add a background color for contrast
      padding: { x: 10, y: 5 } // Optional: Add padding around the text
    });

    generateCardGrid(this); // Generate initial card grid
    selectRandomWord(this); // Select a random word and play its audio
  });

  this.load.start();
}

function update() {
  // Update logic (if needed)
}

function generateCardGrid(scene) {
  clearCards(scene); // Clear existing cards

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

      // Create a background rectangle for the card
      const cardBackground = scene.add.rectangle(
        x + cardWidth / 2,
        y + cardHeight / 2,
        cardWidth,
        cardHeight,
        0xffffff
      );

      // Add text on top of the background
      const cardText = scene.add.text(x, y, word, {
        fontFamily: '"Roboto", sans-serif', // Specify the font family
        fontSize: '96px',
        color: '#000000',
        align: 'center',
        wordWrap: { width: cardWidth - 20 }
      })
        .setOrigin(0.5, 0.5)
        .setPosition(x + cardWidth / 2, y + cardHeight / 2);

      // Make the card interactive
      cardBackground.setInteractive({ useHandCursor: true });
      cardBackground.on('pointerdown', () => handleCardClick(scene, cardBackground, word));

      // Store both the background and text as part of the card
      cards.push({ background: cardBackground, text: cardText });
    }
  }
}

function clearCards(scene) {
  // Destroy all existing cards
  cards.forEach(card => {
    card.background.destroy();
    card.text.destroy();
  });
  cards = [];
}

function disableCards() {
  // Disable interactions for all cards
  cards.forEach(card => {
    card.background.disableInteractive();
  });
}

function enableCards() {
  // Re-enable interactions for all cards
  cards.forEach(card => {
    card.background.setInteractive({ useHandCursor: true });
  });
}

function selectRandomWord(scene) {
  const randomCard = cards[Math.floor(Math.random() * cards.length)];
  currentWord = randomCard.text.text;
  console.log(`Selected word: ${currentWord}`);
  scene.sound.stopAll();
  const audio = scene.sound.add(currentWord);
  audio.play();
}

function handleCardClick(scene, cardBackground, word) {
  if (word === currentWord) {
    // Correct card clicked
    okSnd.play();
    score += 10;
    console.log(`Correct! Score: ${score}`);

    // Update the score text
    scoreText.setText(`Score: ${score}`);

    // Check for win condition
    if (score >= 500) {
      endGame(scene, "Победа!");
      return; // Exit the function to prevent further actions
    }

    // Disable all cards during the delay
    disableCards();
    clearCards(scene); // Clear the card grid

    // Introduce a delay before regenerating the grid and selecting a new word
    scene.time.delayedCall(1000, () => {
      generateCardGrid(scene); // Regenerate the grid
      selectRandomWord(scene); // Select a new word
      enableCards(); // Re-enable card interactions
    });

  } else {
    // Wrong card clicked
    failSnd.play();
    if (score > 0) score -= 5;
    console.log(`Wrong! Score: ${score}`);

    // Update the score text
    scoreText.setText(`Score: ${score}`);

    // Find the full card object in the `cards` array
    const cardIndex = cards.findIndex(card => card.background === cardBackground);
    if (cardIndex !== -1) {
      // Destroy both the background rectangle and the text object
      cards[cardIndex].background.destroy();
      cards[cardIndex].text.destroy();

      // Remove the card from the `cards` array
      cards.splice(cardIndex, 1);
    }
  }
}

function endGame(scene, message) {
  // Clear all cards
  clearCards(scene);

  // Display the victory message in the center of the screen
  victoryText = scene.add.text(
    scene.sys.game.config.width / 2,
    scene.sys.game.config.height / 2,
    message,
    {
      fontSize: '96px',
      color: '#ffffff',
      backgroundColor: '#000000', // Optional: Add a background color for contrast
      padding: { x: 20, y: 10 }, // Optional: Add padding around the text
    }
  )
    .setOrigin(0.5, 0.5); // Center align the text

  // Optionally, stop any ongoing audio
  scene.sound.stopAll();

  // Disable all card interactions
  disableCards();
}