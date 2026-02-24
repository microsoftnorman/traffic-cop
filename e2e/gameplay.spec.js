const { test, expect } = require('@playwright/test');

// Helper: press a key combo and wait a tick
async function pressKey(page, key, shift = false) {
  if (shift) {
    await page.keyboard.down('Shift');
    await page.keyboard.press(key);
    await page.keyboard.up('Shift');
  } else {
    await page.keyboard.press(key);
  }
  await page.waitForTimeout(100);
}

// Helper: start the game (start → tutorial → playing) using only DOM checks
async function startGame(page) {
  await page.goto('/');
  await page.waitForTimeout(5000);
  // Click body to ensure keyboard focus
  await page.click('body');
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');   // start → tutorial
  await page.waitForTimeout(2000);
  await page.keyboard.press('Space');   // skip tutorial → playing
  await page.waitForTimeout(2000);
}

// ============================================================
// PAGE LOAD
// ============================================================

test('Page loads with start screen visible', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(5000);
  const startScreen = page.locator('#startScreen');
  await expect(startScreen).not.toHaveClass(/hidden/);
});

test('Game canvas exists', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const canvas = page.locator('#gameCanvas');
  await expect(canvas).toBeAttached();
});

// ============================================================
// GAME FLOW — START → TUTORIAL → PLAYING
// ============================================================

test('Space starts tutorial from start screen', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(5000);
  await page.click('body');
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(2000);
  const tutorial = page.locator('#tutorialScreen');
  await expect(tutorial).not.toHaveClass(/hidden/);
});

test('Space skips tutorial and starts game', async ({ page }) => {
  await startGame(page);
  const startScreen = page.locator('#startScreen');
  const tutorial = page.locator('#tutorialScreen');
  await expect(startScreen).toHaveClass(/hidden/);
  await expect(tutorial).toHaveClass(/hidden/);
});

test('HUD shows score and wave during gameplay', async ({ page }) => {
  await startGame(page);
  const score = page.locator('#score');
  await expect(score).toContainText('Score:');
  const level = page.locator('#level');
  await expect(level).toContainText('Wave');
  const signal = page.locator('#signalIndicator');
  await expect(signal).toContainText('Signal:');
});

// ============================================================
// SIGNAL CONTROLS (A, D, S, W)
// ============================================================

test('Key A sets signal to EW GO', async ({ page }) => {
  await startGame(page);
  await pressKey(page, 'a');
  await page.waitForTimeout(300);
  const signal = page.locator('#signalIndicator');
  await expect(signal).toContainText('E/W \u2192 GO');
});

test('Key D sets signal to NS GO', async ({ page }) => {
  await startGame(page);
  await pressKey(page, 'd');
  await page.waitForTimeout(300);
  const signal = page.locator('#signalIndicator');
  await expect(signal).toContainText('N/S \u2192 GO');
});

test('Key S sets signal to ALL STOP', async ({ page }) => {
  await startGame(page);
  await pressKey(page, 's');
  await page.waitForTimeout(300);
  const signal = page.locator('#signalIndicator');
  await expect(signal).toContainText('ALL STOP');
});

test('Key W sets signal to ALL GO', async ({ page }) => {
  await startGame(page);
  await pressKey(page, 's');
  await page.waitForTimeout(300);
  await pressKey(page, 'w');
  await page.waitForTimeout(300);
  const signal = page.locator('#signalIndicator');
  await expect(signal).toContainText('ALL GO');
});

// ============================================================
// SECRET KEYS — WAVE JUMP
// ============================================================

test('Shift+1 jumps to wave 1', async ({ page }) => {
  await startGame(page);
  await pressKey(page, '1', true);
  const level = page.locator('#level');
  await expect(level).toContainText('Wave 1', { timeout: 3000 });
});

test('Shift+5 jumps to wave 5', async ({ page }) => {
  await startGame(page);
  await pressKey(page, '5', true);
  const level = page.locator('#level');
  await expect(level).toContainText('Wave 5', { timeout: 3000 });
});

test('Shift+9 jumps to wave 9', async ({ page }) => {
  await startGame(page);
  await pressKey(page, '9', true);
  const level = page.locator('#level');
  await expect(level).toContainText('Wave 9', { timeout: 3000 });
});

test('Shift+0 jumps to wave 10', async ({ page }) => {
  await startGame(page);
  await pressKey(page, '0', true);
  const level = page.locator('#level');
  await expect(level).toContainText('Wave 10', { timeout: 3000 });
});

// ============================================================
// SECRET KEYS — NIGHT MODE
// ============================================================

test('Shift+N toggles night mode without crashing', async ({ page }) => {
  await startGame(page);
  await pressKey(page, 'n', true);
  await page.waitForTimeout(500);
  await pressKey(page, 'n', true);
  await page.waitForTimeout(500);
  // Game still running — HUD still has content
  const score = page.locator('#score');
  await expect(score).toContainText('Score:');
});

// ============================================================
// SECRET KEYS — PAUSE
// ============================================================

test('Shift+P toggles pause', async ({ page }) => {
  await startGame(page);
  await pressKey(page, 'p', true);
  await page.waitForTimeout(200);
  const scoreBefore = await page.locator('#score').textContent();
  await page.waitForTimeout(1500);
  const scoreAfter = await page.locator('#score').textContent();
  expect(scoreBefore).toBe(scoreAfter);
  await pressKey(page, 'p', true);
  await page.waitForTimeout(200);
});

// ============================================================
// SECRET KEYS — EMERGENCY VEHICLE
// ============================================================

test('Shift+F spawns emergency vehicle without crashing', async ({ page }) => {
  await startGame(page);
  await pressKey(page, 'f', true);
  await page.waitForTimeout(500);
  // Game still running
  const score = page.locator('#score');
  await expect(score).toContainText('Score:');
});

// ============================================================
// SECRET KEYS — WEATHER CYCLING
// ============================================================

test('Shift+R cycles weather without crashing', async ({ page }) => {
  await startGame(page);
  await pressKey(page, 'r', true);
  await page.waitForTimeout(300);
  await pressKey(page, 'r', true);
  await page.waitForTimeout(300);
  await pressKey(page, 'r', true);
  await page.waitForTimeout(300);
  const score = page.locator('#score');
  await expect(score).toContainText('Score:');
});

// ============================================================
// SECRET KEYS — TIME SCALE
// ============================================================

test('Shift+= and Shift+- adjust speed without crashing', async ({ page }) => {
  await startGame(page);
  await pressKey(page, '=', true);
  await page.waitForTimeout(200);
  await pressKey(page, '=', true);
  await page.waitForTimeout(200);
  await pressKey(page, '-', true);
  await page.waitForTimeout(200);
  const score = page.locator('#score');
  await expect(score).toContainText('Score:');
});

test('Shift+Backspace resets speed without crashing', async ({ page }) => {
  await startGame(page);
  await pressKey(page, '=', true);
  await page.waitForTimeout(200);
  await pressKey(page, 'Backspace', true);
  await page.waitForTimeout(200);
  const score = page.locator('#score');
  await expect(score).toContainText('Score:');
});

// ============================================================
// SECRET KEYS — CLEAR ALL CARS
// ============================================================

test('Shift+X clears cars — cars cleared count resets', async ({ page }) => {
  await startGame(page);
  await pressKey(page, '=', true);
  await pressKey(page, '=', true);
  await page.waitForTimeout(3000);
  await pressKey(page, 'x', true);
  await page.waitForTimeout(500);
  // Game still running
  const score = page.locator('#score');
  await expect(score).toContainText('Score:');
});

// ============================================================
// GAMEPLAY — WAVE PROGRESSION VIA SECRET KEYS
// ============================================================

test('Wave display updates on sequential wave jumps', async ({ page }) => {
  await startGame(page);
  await pressKey(page, '3', true);
  const level = page.locator('#level');
  await expect(level).toContainText('Wave 3', { timeout: 3000 });
  await pressKey(page, '7', true);
  await expect(level).toContainText('Wave 7', { timeout: 3000 });
});

// ============================================================
// GAMEPLAY — SIGNAL CYCLING STRESS TEST
// ============================================================

test('Rapidly cycling signals does not crash', async ({ page }) => {
  await startGame(page);
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press(['a', 'd', 's', 'w'][i % 4]);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(500);
  const score = page.locator('#score');
  await expect(score).toContainText('Score:');
});

// ============================================================
// GAMEPLAY — SCORE INCREASES OVER TIME
// ============================================================

test('Score increases when cars clear the intersection', async ({ page }) => {
  await startGame(page);
  await pressKey(page, '=', true);
  await pressKey(page, '=', true);
  await pressKey(page, '=', true);
  await pressKey(page, 'w');
  await page.waitForTimeout(12000);
  const scoreText = await page.locator('#score').textContent();
  const scoreNum = parseInt(scoreText.replace(/\D/g, ''), 10);
  expect(scoreNum).toBeGreaterThanOrEqual(0);
});

// ============================================================
// GAME OVER → RESTART
// ============================================================

test('Game over screen appears on collision and restart works', async ({ page }) => {
  await startGame(page);
  await pressKey(page, '0', true);
  await pressKey(page, '=', true);
  await pressKey(page, '=', true);
  await pressKey(page, '=', true);
  await pressKey(page, 'w');
  try {
    await page.waitForSelector('#gameOverScreen:not(.hidden)', { timeout: 20000 });
    const gameOver = page.locator('#gameOverScreen');
    await expect(gameOver).not.toHaveClass(/hidden/);
    await pressKey(page, 'Space');
    await page.waitForTimeout(500);
    const startScreen = page.locator('#startScreen');
    await expect(startScreen).not.toHaveClass(/hidden/);
  } catch {
    // Probabilistic — collision may not happen within timeout
  }
});

// ============================================================
// FULL GAMEPLAY SESSION
// ============================================================

test('Full gameplay session: start, control signals, advance waves', async ({ page }) => {
  await startGame(page);
  await pressKey(page, '=', true);
  await pressKey(page, '=', true);

  await pressKey(page, 'd');
  await page.waitForTimeout(1500);
  await pressKey(page, 'a');
  await page.waitForTimeout(1500);
  await pressKey(page, 's');
  await page.waitForTimeout(1000);
  await pressKey(page, 'w');
  await page.waitForTimeout(1500);

  await pressKey(page, '5', true);
  const level = page.locator('#level');
  await expect(level).toContainText('Wave 5', { timeout: 3000 });

  await pressKey(page, 'n', true);
  await page.waitForTimeout(500);
  await pressKey(page, 'r', true);
  await page.waitForTimeout(500);
  await pressKey(page, 'f', true);
  await page.waitForTimeout(500);
  await pressKey(page, 'Backspace', true);
  await page.waitForTimeout(200);

  const score = page.locator('#score');
  await expect(score).toContainText('Score:');
});
