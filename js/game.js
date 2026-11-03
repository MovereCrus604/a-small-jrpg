/*
 * A SMALL JRPG - game flow & screens
 *
 * Re-implementation of SimpleJrpg.Combat.BattleScreenController (screens, map,
 * battle commands, shop, rest site, rebirth shop, settlement). Layout numbers,
 * colours, strings and rules come from the original Unity build.
 */
(function () {
  'use strict';
  const J = window.JRPG, U = window.JRPGUI;
  const { DT, RL, AT, RT, BI } = J;
  const { V, C, WHITE } = U;
  const GOLD = C(0.96, 0.81, 0.53);
  const BG_RESET = C(0.10, 0.12, 0.18);
  const D = J.damageTypeName;

  // ---- PlayerPrefs replacement (localStorage with in-memory fallback) ----------------------------
  const Prefs = {
    mem: {},
    key: (k) => 'ASmallJrpg.' + k,
    raw(k) { try { const v = localStorage.getItem(this.key(k)); if (v !== null) return v; } catch (e) { /* ignore */ } return k in this.mem ? this.mem[k] : null; },
    set(k, v) { this.mem[k] = String(v); try { localStorage.setItem(this.key(k), String(v)); } catch (e) { /* ignore */ } },
    getInt(k, d) { const r = this.raw(k); const n = parseInt(r, 10); return r === null || isNaN(n) ? (d || 0) : n; },
    getFloat(k, d) { const r = this.raw(k); const n = parseFloat(r); return r === null || isNaN(n) ? d : n; },
    hasKey(k) { return this.raw(k) !== null; },
    del(k) { delete this.mem[k]; try { localStorage.removeItem(this.key(k)); } catch (e) { /* ignore */ } },
  };

  // ---- state -----------------------------------------------------------------------------------------
  const G = {
    nodes: {}, visited: new Set(), upgradedAtRest: new Set(), inventory: [], battleItems: {}, shopPrices: {},
    ownedWeapons: [], ownedArmor: [], currentNodeId: 'start', gold: 0,
    restUsed: false, upgradeUsed: false,
    metaGold: 0, hardBattleCount: 0, eventGoldEarned: 0, bossDefeated: false, runSettled: false,
    enemies: [], player: null, selectedWeapon: null,
    message: null, commandRoot: null, commandIndex: 0, commandRowCount: 3, playerCard: null,
    playerTurn: false, battleOver: false,
    pendingDouble: false, pendingCowardly: false, pendingMagicType: null, pendingMagicMult: 1.0, pendingMagicSp: 0, pendingStrangeThrow: false,
    playerStunnedNext: false, incIncrease: 0, incTurns: 0, atkReduction: 0, atkTurns: 0,
  };
  window.JRPG.G = G; // handy for debugging / tests

  const COST = { hpTraining: 3750, spTraining: 3750, enchant: 75, magic: 3750, mastery: 1900 };
  const TRAINING_AMOUNT = 50;

  const menuBtn = (...a) => U.menuButton(...a);
  const text = (...a) => U.label(...a);
  const box = (...a) => U.panel(...a);

  // ---- boot ----------------------------------------------------------------------------------------------
  function start() {
    G.metaGold = Prefs.getInt('MetaGold', 0);
    showMainMenu();
  }

  // ==============================================================================================================
  //  Title / settings
  // ==============================================================================================================
  function showMainMenu() {
    G.selectedWeapon = null;
    const cv = U.newCanvas('Title Menu Canvas');
    box(cv, 'Background', V(0, 0), V(1, 1), C(0.08, 0.10, 0.16));
    box(cv, 'Title Panel', V(0.25, 0.66), V(0.75, 0.91), C(0.14, 0.17, 0.25));
    text(cv, 'Game Title', 'A SMALL JRPG', 54, 4, V(0.25, 0.75), V(0.75, 0.88), GOLD);
    text(cv, 'Game Subtitle', '속성과 선택의 모험', 28, 4, V(0.25, 0.68), V(0.75, 0.76), WHITE);
    menuBtn(cv, 'Start Game', '게임 시작하기', V(0.35, 0.53), V(0.65, 0.62), startGame);
    menuBtn(cv, 'Rebirth Shop', '환생 상점', V(0.35, 0.41), V(0.65, 0.50), showRebirthShop);
    menuBtn(cv, 'Open Settings', '설정', V(0.35, 0.29), V(0.65, 0.38), showSettings);
    // "게임 종료하기" (Application.Quit) has no meaning in a browser, so it is not shown.
  }

  const fsSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function setFullscreen(on) {
    const el = document.documentElement;
    try {
      if (on) { (el.requestFullscreen || el.webkitRequestFullscreen).call(el); }
      else if (isFullscreen()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    } catch (e) { /* ignore */ }
    Prefs.set('Fullscreen', on ? 1 : 0);
  }

  function showSettings() {
    const cv = U.newCanvas('Title Menu Canvas');
    box(cv, 'Background', V(0, 0), V(1, 1), C(0.08, 0.10, 0.16));
    text(cv, 'Settings Title', '설정', 48, 4, V(0.30, 0.82), V(0.70, 0.94), GOLD);
    text(cv, 'Master Volume Label', '마스터 볼륨', 28, 3, V(0.20, 0.66), V(0.43, 0.76), WHITE);
    createVolumeSlider(cv, V(0.45, 0.68), V(0.78, 0.75));
    if (fsSupported()) {
      // (The PC resolution selector is not applicable in a browser; fullscreen toggle is kept.)
      text(cv, 'Fullscreen Label', '전체 화면', 28, 3, V(0.20, 0.49), V(0.43, 0.59), WHITE);
      createFullscreenToggle(cv, V(0.47, 0.50), V(0.53, 0.58));
    }
    menuBtn(cv, 'Settings Back', '돌아가기', V(0.38, 0.12), V(0.62, 0.22), showMainMenu);
  }

  function createVolumeSlider(parent, min, max) {
    const root = box(parent, 'Master Volume Slider', min, max, U.CLEAR);
    const track = box(root, 'Track', V(0, 0.30), V(1, 0.70), C(0.04, 0.05, 0.08));
    const fill = box(track, 'Fill', V(0, 0), V(1, 1), C(0.37, 0.67, 0.91));
    const handle = box(root, 'Handle', V(0, 0), V(0, 1), WHITE);
    handle.style.width = 'calc(var(--u) * 28)';
    handle.style.transform = 'translateX(-50%)';
    root.classList.add('slider');
    const set = (v, save) => {
      v = Math.min(Math.max(v, 0), 1);
      fill.style.width = (v * 100) + '%';
      handle.style.left = (v * 100) + '%';
      if (save) { Prefs.set('MasterVolume', v); }
    };
    set(Prefs.getFloat('MasterVolume', 1.0), false);
    const fromEvent = (e) => { const r = root.getBoundingClientRect(); set((e.clientX - r.left) / r.width, true); };
    root.addEventListener('pointerdown', (e) => { root.setPointerCapture(e.pointerId); fromEvent(e); });
    root.addEventListener('pointermove', (e) => { if (root.hasPointerCapture(e.pointerId)) fromEvent(e); });
  }

  function createFullscreenToggle(parent, min, max) {
    const root = box(parent, 'Fullscreen Toggle', min, max, U.CLEAR);
    const bx = box(root, 'Box', V(0, 0), V(1, 1), C(0.20, 0.24, 0.33));
    const mark = box(bx, 'Checkmark', V(0.2, 0.2), V(0.8, 0.8), GOLD);
    const refresh = () => { mark.style.display = isFullscreen() ? 'block' : 'none'; };
    refresh();
    root.style.cursor = 'pointer';
    root.addEventListener('click', () => { setFullscreen(!isFullscreen()); setTimeout(refresh, 200); });
    document.addEventListener('fullscreenchange', refresh);
  }

  // ==============================================================================================================
  //  Rebirth shop (meta progression)
  // ==============================================================================================================
  const REBIRTH_BG = C(0.10, 0.12, 0.18);
  const rebirthGoldTitle = (cv, name, title, size, min, max) => text(cv, name, title, size, 4, min, max, GOLD);

  function spendRebirthGold(n) {
    if (n < 0 || G.metaGold < n) return false;
    G.metaGold -= n;
    Prefs.set('RebirthSpentGold', Prefs.getInt('RebirthSpentGold', 0) + n);
    Prefs.set('MetaGold', G.metaGold);
    return true;
  }
  const getRebirthEnchantment = () => { const v = Prefs.getInt('RebirthEnchantment', -1); return v < 3 || v > 7 ? null : v; };
  const getMagicMask = () => Prefs.getInt('RebirthMagicMask', 0);
  const isMagicUnlocked = (t) => { const i = J.AVAILABLE_ELEMENTS.indexOf(t); return i >= 0 && (getMagicMask() & (1 << i)) > 0; };
  const hasAllMagic = () => { const m = (1 << J.AVAILABLE_ELEMENTS.length) - 1; return (getMagicMask() & m) === m; };
  const MASTERY_KEYS = { [DT.Slash]: 'RebirthSlashMastery', [DT.Pierce]: 'RebirthPierceMastery', [DT.Blunt]: 'RebirthBluntMastery' };
  const masteryBonus = (t) => (MASTERY_KEYS[t] ? Prefs.getInt(MASTERY_KEYS[t], 0) : 0);

  function showRebirthShop() {
    const cv = U.newCanvas('Rebirth Shop Canvas');
    box(cv, 'Rebirth Shop Background', V(0, 0), V(1, 1), REBIRTH_BG);
    rebirthGoldTitle(cv, 'Rebirth Shop Title', '환생 상점', 46, V(0.28, 0.90), V(0.72, 0.98));
    text(cv, 'Rebirth Gold', '영구 골드: ' + G.metaGold + 'G', 28, 4, V(0.30, 0.82), V(0.70, 0.89), WHITE);
    text(cv, 'Rebirth Training', '기초 단련  |  최대 체력과 기력 강화', 27, 4, V(0.20, 0.74), V(0.80, 0.81), WHITE);
    menuBtn(cv, 'Open Training Shop', '단련 목록 보기', V(0.38, 0.65), V(0.62, 0.72), showTrainingShop);
    const ench = getRebirthEnchantment();
    text(cv, 'Rebirth Enchantment', ench === null ? '인챈트: 속성 1개 해금  |  ' + COST.enchant + 'G' : '인챈트: ' + D(ench) + ' (기본 공격 속성 추가)',
      25, 4, V(0.12, 0.55), V(0.88, 0.63), WHITE);
    menuBtn(cv, 'Choose Enchantment', ench === null ? '인챈트 선택' : '인챈트 보유 중', V(0.38, 0.46), V(0.62, 0.53), showEnchantmentShop);
    text(cv, 'Growth Shop Label', '전투 성장  |  마법 습득과 물리 숙달', 24, 4, V(0.12, 0.36), V(0.88, 0.44), C(0.76, 0.80, 0.86));
    menuBtn(cv, 'Open Growth Shop', '성장 목록 보기', V(0.38, 0.27), V(0.62, 0.34), showGrowthShop);
    menuBtn(cv, 'Reset Rebirth', '초기화 및 환급', V(0.36, 0.16), V(0.64, 0.23), showRebirthReset);
    menuBtn(cv, 'Rebirth Shop Back', '돌아가기', V(0.38, 0.05), V(0.62, 0.12), showMainMenu);
  }

  function showTrainingShop() {
    const cv = U.newCanvas('Rebirth Shop Canvas');
    box(cv, 'Training Shop Background', V(0, 0), V(1, 1), REBIRTH_BG);
    rebirthGoldTitle(cv, 'Training Shop Title', '기초 단련', 42, V(0.25, 0.88), V(0.75, 0.96));
    text(cv, 'Training Shop Gold', '환생 골드: ' + G.metaGold + 'G', 26, 4, V(0.25, 0.79), V(0.75, 0.86), WHITE);
    text(cv, 'HP Training Label', '체력 단련  |  최대 HP +' + TRAINING_AMOUNT + '  |  ' + COST.hpTraining + 'G', 25, 4, V(0.12, 0.65), V(0.88, 0.73), WHITE);
    menuBtn(cv, 'Buy HP Training', '체력 단련 구매', V(0.34, 0.53), V(0.66, 0.62), () => {
      if (!spendRebirthGold(COST.hpTraining)) return;
      Prefs.set('RebirthHpBonus', Prefs.getInt('RebirthHpBonus', 0) + TRAINING_AMOUNT);
      showTrainingShop();
    }).setInteractable(G.metaGold >= COST.hpTraining);
    text(cv, 'SP Training Label', '기력 단련  |  최대 SP +' + TRAINING_AMOUNT + '  |  ' + COST.spTraining + 'G', 25, 4, V(0.12, 0.39), V(0.88, 0.47), WHITE);
    menuBtn(cv, 'Buy SP Training', '기력 단련 구매', V(0.34, 0.27), V(0.66, 0.36), () => {
      if (!spendRebirthGold(COST.spTraining)) return;
      Prefs.set('RebirthSpBonus', Prefs.getInt('RebirthSpBonus', 0) + TRAINING_AMOUNT);
      showTrainingShop();
    }).setInteractable(G.metaGold >= COST.spTraining);
    menuBtn(cv, 'Training Shop Back', '돌아가기', V(0.38, 0.08), V(0.62, 0.16), showRebirthShop);
  }

  function showEnchantmentShop() {
    const cv = U.newCanvas('Rebirth Shop Canvas');
    box(cv, 'Enchantment Shop Background', V(0, 0), V(1, 1), REBIRTH_BG);
    rebirthGoldTitle(cv, 'Enchantment Shop Title', '기본 공격 인챈트', 42, V(0.25, 0.89), V(0.75, 0.97));
    text(cv, 'Enchantment Shop Gold', '영구 골드: ' + G.metaGold + 'G  |  가격: ' + COST.enchant + 'G', 25, 4, V(0.20, 0.81), V(0.80, 0.88), WHITE);
    const cur = getRebirthEnchantment();
    text(cv, 'Enchantment Description', cur === null ? '물리 공격 속성에 마법 속성 하나를 추가합니다. 한 가지만 선택할 수 있어요.'
      : '이미 ' + D(cur) + ' 인챈트를 해금했어. 인챈트는 하나만 보유할 수 있어.', 21, 4, V(0.12, 0.74), V(0.88, 0.80), WHITE);
    const names = ['불', '물', '바람', '번개', '땅'];
    J.AVAILABLE_ELEMENTS.forEach((type, i) => {
      const y = 0.71 - i * 0.105;
      const suffix = cur === type ? ' · 보유 중' : ' · 기본 공격에 속성 추가';
      menuBtn(cv, 'Enchant ' + type, '인챈트: ' + names[i] + suffix, V(0.24, y - 0.075), V(0.76, y), () => {
        if (getRebirthEnchantment() !== null || !J.AVAILABLE_ELEMENTS.includes(type)) return;
        if (!spendRebirthGold(COST.enchant)) return;
        Prefs.set('RebirthEnchantment', type);
        showEnchantmentShop();
      }).setInteractable(cur === null && G.metaGold >= COST.enchant);
    });
    menuBtn(cv, 'Enchantment Shop Back', '돌아가기', V(0.38, 0.035), V(0.62, 0.105), showRebirthShop);
  }

  function showGrowthShop() {
    const cv = U.newCanvas('Rebirth Shop Canvas');
    box(cv, 'Growth Shop Background', V(0, 0), V(1, 1), REBIRTH_BG);
    rebirthGoldTitle(cv, 'Growth Shop Title', '전투 성장', 42, V(0.25, 0.88), V(0.75, 0.96));
    text(cv, 'Growth Shop Gold', '환생 골드: ' + G.metaGold + 'G', 26, 4, V(0.25, 0.79), V(0.75, 0.86), WHITE);
    menuBtn(cv, 'Open Elemental Magic Shop', '마법 습득', V(0.32, 0.57), V(0.68, 0.68), showMagicShop);
    text(cv, 'Elemental Magic Description', '속성 마법 각 ' + COST.magic + 'G · SP 10 · 위력 1배 · 전부 해금 시 매기도', 20, 4, V(0.12, 0.49), V(0.88, 0.56), WHITE);
    menuBtn(cv, 'Open Physical Mastery Shop', '물리 숙달', V(0.32, 0.31), V(0.68, 0.42), showMasteryShop);
    text(cv, 'Physical Mastery Description', '참격·관통·타격 공격력 +1 · 각 ' + COST.mastery + 'G', 21, 4, V(0.18, 0.23), V(0.82, 0.30), WHITE);
    menuBtn(cv, 'Growth Shop Back', '돌아가기', V(0.38, 0.07), V(0.62, 0.15), showRebirthShop);
  }

  function showMagicShop() {
    const cv = U.newCanvas('Rebirth Shop Canvas');
    box(cv, 'Magic Shop Background', V(0, 0), V(1, 1), REBIRTH_BG);
    rebirthGoldTitle(cv, 'Magic Shop Title', '마법 습득', 42, V(0.25, 0.89), V(0.75, 0.97));
    text(cv, 'Magic Shop Gold', '환생 골드: ' + G.metaGold + 'G  |  속성 마법 각 ' + COST.magic + 'G', 24, 4, V(0.15, 0.81), V(0.85, 0.88), WHITE);
    text(cv, 'Magic Shop Hint', '불·물·바람·번개·땅 마법은 SP 10, 위력 1배', 21, 4, V(0.12, 0.75), V(0.88, 0.80), C(0.78, 0.82, 0.90));
    J.AVAILABLE_ELEMENTS.forEach((type, i) => {
      const unlocked = isMagicUnlocked(type);
      const y = 0.70 - i * 0.092;
      menuBtn(cv, 'Magic ' + type, unlocked ? D(type) + ' 마법 · 해금 완료' : D(type) + ' 마법 · 해금 ' + COST.magic + 'G', V(0.24, y - 0.075), V(0.76, y), () => {
        const idx = J.AVAILABLE_ELEMENTS.indexOf(type);
        if (idx < 0 || isMagicUnlocked(type)) return;
        if (!spendRebirthGold(COST.magic)) return;
        Prefs.set('RebirthMagicMask', getMagicMask() | (1 << idx));
        showMagicShop();
      }).setInteractable(!unlocked && G.metaGold >= COST.magic);
    });
    const all = hasAllMagic();
    text(cv, 'Magido Status', all ? '매기도 · 해금 완료 · SP 30 · 만능 피해 2배' : '매기도 · 모든 속성 마법을 해금하면 열립니다 · SP 30 · 만능 피해 2배',
      20, 4, V(0.10, 0.17), V(0.90, 0.23), all ? GOLD : C(0.68, 0.71, 0.77));
    menuBtn(cv, 'Magic Shop Back', '돌아가기', V(0.38, 0.06), V(0.62, 0.13), showGrowthShop);
  }

  function showMasteryShop() {
    const cv = U.newCanvas('Rebirth Shop Canvas');
    box(cv, 'Mastery Shop Background', V(0, 0), V(1, 1), REBIRTH_BG);
    rebirthGoldTitle(cv, 'Mastery Shop Title', '물리 숙달', 42, V(0.25, 0.88), V(0.75, 0.96));
    text(cv, 'Mastery Shop Gold', '환생 골드: ' + G.metaGold + 'G  |  구매할 때마다 해당 공격 +1', 23, 4, V(0.12, 0.79), V(0.88, 0.86), WHITE);
    [DT.Slash, DT.Pierce, DT.Blunt].forEach((type, i) => {
      const key = MASTERY_KEYS[type];
      const y = 0.68 - i * 0.16;
      menuBtn(cv, 'Mastery ' + type, D(type) + ' 숙달 · 현재 +' + Prefs.getInt(key, 0) + ' · 구매 +1 (' + COST.mastery + 'G)', V(0.18, y - 0.11), V(0.82, y), () => {
        if (!spendRebirthGold(COST.mastery)) return;
        Prefs.set(key, Prefs.getInt(key, 0) + 1);
        showMasteryShop();
      }).setInteractable(G.metaGold >= COST.mastery);
    });
    menuBtn(cv, 'Mastery Shop Back', '돌아가기', V(0.38, 0.10), V(0.62, 0.18), showGrowthShop);
  }

  function showRebirthReset() {
    const cv = U.newCanvas('Rebirth Shop Canvas');
    box(cv, 'Rebirth Reset Background', V(0, 0), V(1, 1), REBIRTH_BG);
    const spent = Prefs.getInt('RebirthSpentGold', 0);
    text(cv, 'Rebirth Reset Title', '환생 강화 초기화', 42, 4, V(0.22, 0.72), V(0.78, 0.86), WHITE);
    text(cv, 'Rebirth Reset Description', '구매한 영구 능력치, 인챈트, 해금 기술을 초기화하고\n사용한 골드 ' + spent + 'G를 돌려받습니다.', 26, 4, V(0.18, 0.48), V(0.82, 0.66), WHITE);
    menuBtn(cv, 'Confirm Rebirth Reset', '초기화하고 환급받기', V(0.28, 0.31), V(0.52, 0.41), () => {
      G.metaGold += Prefs.getInt('RebirthSpentGold', 0);
      Prefs.set('MetaGold', G.metaGold);
      Prefs.set('RebirthSpentGold', 0);
      Prefs.set('RebirthHpBonus', 0); Prefs.set('RebirthSpBonus', 0); Prefs.set('RebirthSkillUnlocks', 0);
      Prefs.set('RebirthEnchantment', -1); Prefs.set('RebirthMagicMask', 0);
      Prefs.set('RebirthSlashMastery', 0); Prefs.set('RebirthPierceMastery', 0); Prefs.set('RebirthBluntMastery', 0);
      Prefs.del('RebirthUnlockedSkills'); Prefs.del('RebirthUnlockedSkillIds');
      showRebirthShop();
    });
    menuBtn(cv, 'Cancel Rebirth Reset', '취소', V(0.55, 0.31), V(0.72, 0.41), showRebirthShop);
  }

  // ==============================================================================================================
  //  New run: weapon selection
  // ==============================================================================================================
  function startGame() {
    G.selectedWeapon = null;
    buildWeaponSelection();
  }

  function buildWeaponSelection() {
    const cv = U.newCanvas('Starting Equipment Canvas');
    box(cv, 'Background', V(0, 0), V(1, 1), BG_RESET);
    text(cv, 'Title', '무기를 하나 선택하세요', 48, 4, V(0.20, 0.79), V(0.80, 0.94), WHITE);
    text(cv, 'Subtitle', '선택한 무기는 기본 공격의 속성과 공격력을 결정합니다', 25, 4, V(0.15, 0.71), V(0.85, 0.80), C(0.77, 0.81, 0.89));
    weaponChoice(cv, J.createLongsword(), V(0.12, 0.23), V(0.36, 0.68), '롱소드', '참격 공격', C(0.40, 0.53, 0.72));
    weaponChoice(cv, J.createRapier(), V(0.38, 0.23), V(0.62, 0.68), '레이피어', '관통 공격', C(0.52, 0.46, 0.72));
    weaponChoice(cv, J.createMace(), V(0.64, 0.23), V(0.88, 0.68), '메이스', '타격 공격', C(0.68, 0.47, 0.36));
    text(cv, 'Armor Note', '기본 방어구: 천갑옷  |  물리: 보통  ·  불/물/바람/번개/땅: 약점  ·  만능: 보통', 22, 4, V(0.08, 0.08), V(0.92, 0.17), WHITE);
  }

  function weaponChoice(parent, weapon, min, max, name, typeText, col) {
    const el = box(parent, weapon.name + ' Choice', min, max, col);
    U.makeButton(el, () => selectStartingWeapon(weapon));
    text(el, 'Weapon Name', name, 40, 4, V(0.05, 0.65), V(0.95, 0.90), WHITE);
    text(el, 'Damage Type', typeText, 29, 4, V(0.05, 0.40), V(0.95, 0.64), WHITE);
    text(el, 'Attack Bonus', '공격력 +5', 31, 4, V(0.05, 0.14), V(0.95, 0.39), WHITE);
  }

  function selectStartingWeapon(weapon) {
    if (G.selectedWeapon) return;
    G.selectedWeapon = weapon;
    const p = new J.Combatant();
    p.name = '주인공';
    p.maxHp = 150 + Prefs.getInt('RebirthHpBonus', 0);
    p.maxSp = 40 + Prefs.getInt('RebirthSpBonus', 0);
    p.attack = 20; p.defense = 15;
    p.weapon = weapon;
    p.enchant = getRebirthEnchantment();
    p.armor.push(J.createClothArmor());
    p.initializeResources();
    G.player = p;
    G.ownedWeapons = []; G.ownedArmor = [];
    if (p.weapon) G.ownedWeapons.push(p.weapon);
    for (const a of p.armor) if (a) G.ownedArmor.push(a);
    initializeMap();
    showFieldMap();
  }

  // ==============================================================================================================
  //  Field map
  // ==============================================================================================================
  function addNode(id, title, type, x, y, isStart) { G.nodes[id] = { id, title, type, position: V(x, y), isStart: !!isStart, nextIds: [] }; }
  const connect = (id, next) => { G.nodes[id].nextIds.push(...next); };

  function initializeMap() {
    G.nodes = {}; G.visited = new Set(); G.upgradedAtRest = new Set(); G.inventory = [];
    G.shopPrices = {
      [DT.Slash]: J.randInt(150, 201), [DT.Pierce]: J.randInt(150, 201), [DT.Blunt]: J.randInt(150, 201),
    };
    G.battleItems = { [BI.SpPotion]: 1, [BI.HpPotion]: 1, [BI.StrangePotion]: 1 };
    G.gold = 0; G.hardBattleCount = 0; G.eventGoldEarned = 0; G.bossDefeated = false; G.runSettled = false;
    addNode('start', '시작', RT.Battle, 0.06, 0.67, true);
    addNode('battle1', '전투', RT.Battle, 0.17, 0.67);
    addNode('battle2', '전투', RT.Battle, 0.28, 0.67);
    addNode('battle3', '전투', RT.Battle, 0.39, 0.67);
    addNode('event', '이벤트 방', RT.Event, 0.50, 0.67);
    addNode('rest1', '휴식처', RT.Rest, 0.61, 0.67);
    addNode('battle4', '전투', RT.Battle, 0.72, 0.67);
    addNode('rest2', '휴식처', RT.Rest, 0.83, 0.67);
    addNode('boss', '보스', RT.Boss, 0.94, 0.67);
    addNode('branchBattle', '전투', RT.Battle, 0.50, 0.30);
    addNode('branchHard', '어려운 전투', RT.HardBattle, 0.64, 0.30);
    addNode('branchShop', '상점', RT.Shop, 0.78, 0.30);
    connect('start', ['battle1']);
    connect('battle1', ['battle2']);
    connect('battle2', ['battle3']);
    connect('battle3', ['event', 'branchBattle']);
    connect('event', ['rest1']);
    connect('rest1', ['battle4']);
    connect('battle4', ['rest2']);
    connect('branchBattle', ['branchHard']);
    connect('branchHard', ['branchShop']);
    connect('branchShop', ['rest2']);
    connect('rest2', ['boss']);
    G.currentNodeId = 'start';
  }

  const NODE_COLORS = {
    [RT.Event]: C(0.37, 0.45, 0.69), [RT.Battle]: C(0.68, 0.28, 0.25), [RT.HardBattle]: C(0.39, 0.13, 0.17),
    [RT.Rest]: C(0.28, 0.53, 0.39), [RT.Shop]: C(0.67, 0.51, 0.23), [RT.Boss]: C(0.44, 0.17, 0.40),
  };
  function nodeColor(type, bright) {
    const base = NODE_COLORS[type] || C(0.30, 0.36, 0.42);
    return bright ? base : U.lerpColor(base, C(0.10, 0.12, 0.14), 0.52);
  }
  const ICONS = { [RT.Event]: '?', [RT.Battle]: '⚔', [RT.HardBattle]: '☠', [RT.Rest]: '🔥', [RT.Shop]: '💰', [RT.Boss]: '☠⚔' };

  function showFieldMap() {
    const cv = U.newCanvas('Field Map Canvas');
    box(cv, 'Map Background', V(0, 0), V(1, 1), C(0.09, 0.13, 0.17));
    text(cv, 'Map Title', '테스트 경로', 43, 4, V(0.25, 0.93), V(0.65, 0.99), GOLD);
    text(cv, 'Map Hint', '선으로 이어진 다음 방만 선택 가능', 22, 3, V(0.12, 0.87), V(0.65, 0.93), WHITE);
    const cur = G.nodes[G.currentNodeId];
    if (cur.type === RT.Boss && G.visited.has(cur.id)) {
      text(cv, 'Route Complete', '테스트 경로를 모두 통과했습니다!', 36, 4, V(0.25, 0.50), V(0.75, 0.63), WHITE);
      menuBtn(cv, 'Return To Title', '타이틀로', V(0.38, 0.34), V(0.62, 0.44), showMainMenu);
      return;
    }
    // route lines first (drawn below nodes)
    for (const n of Object.values(G.nodes)) {
      for (const nid of n.nextIds) U.line(cv, 'Route ' + n.id + ' to ' + nid, n.position, G.nodes[nid].position, 7, C(0.58, 0.66, 0.68, 0.65));
    }
    for (const n of Object.values(G.nodes)) {
      if (n.isStart) continue;
      createMapNode(cv, n, n.id === G.currentNodeId || cur.nextIds.includes(n.id));
    }
    createMapNode(cv, G.nodes.start, G.currentNodeId === 'start');
    text(cv, 'Map Status', '현재: ' + cur.title + '    HP ' + G.player.currentHp + '/' + G.player.totalMaxHp + '    보유 골드 ' + G.gold + 'G', 22, 4, V(0.15, 0.02), V(0.85, 0.09), WHITE);
    text(cv, 'Run Gold', '여정 골드 ' + G.gold + 'G', 24, 5, V(0.68, 0.91), V(0.83, 0.98), C(0.98, 0.86, 0.57));
    menuBtn(cv, 'Character Menu', '캐릭터 / 장비', V(0.84, 0.91), V(0.98, 0.98), showCharacterMenu);
  }

  function createMapNode(cv, node, a2) {
    const icon = node.isStart ? '◉' : ICONS[node.type] || '•';
    const title = node.isStart ? '시작' : node.title;
    const canEnter = !node.isStart && a2 && !G.visited.has(node.id);
    // Button (ColorTint) whose interactable == canEnter; non-enterable nodes therefore use the
    // disabled tint (semi-transparent), exactly like the original.
    const el = U.centered(cv, 'Node ' + node.id, node.position, node.isStart ? 110 : 118, nodeColor(node.type, a2));
    el.classList.add('node');
    U.makeButton(el, () => { if (canEnter) tryEnterNode(node); });
    el.setInteractable(canEnter);
    // EventTrigger PointerEnter/Exit: scale 1.18 + lighten (colour uses canEnter, as in the original)
    const rest = nodeColor(node.type, canEnter);
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      el.style.transform = 'translate(-50%, 50%) scale(1.18)';
      U.setColor(el, U.lerpColor(rest, WHITE, 0.35));
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; U.setColor(el, rest); });
    text(el, 'Icon', icon, node.type === RT.Boss ? 48 : 52, 4, V(0.04, 0.08), V(0.96, 0.94), WHITE);
    text(cv, 'Label ' + node.id, title, 24, 4, V(node.position.x - 0.055, node.position.y - 0.125), V(node.position.x + 0.055, node.position.y - 0.075), WHITE);
  }

  function tryEnterNode(node) {
    const cur = G.nodes[G.currentNodeId];
    if (node.isStart || !cur.nextIds.includes(node.id) || G.visited.has(node.id)) return;
    G.currentNodeId = node.id;
    G.visited.add(node.id);
    if (node.type === RT.HardBattle) G.hardBattleCount++;
    switch (node.type) {
      case RT.Battle: buildBattle('전투', node.id === 'battle1' || node.id === 'battle3' ? J.createSkeletonKnight() : J.createSkeletonShieldBearer()); break;
      case RT.HardBattle: buildBattle('어려운 전투', J.createSkeletonMage()); break;
      case RT.Boss: buildBattle('보스 전투', J.createSkeletonLord()); break;
      case RT.Rest: G.upgradedAtRest = new Set(); G.restUsed = false; G.upgradeUsed = false; showRestRoom(''); break;
      case RT.Shop: showShopRoom(); break;
      case RT.Event: showSuspiciousTraveler(null); break;
      default: break;
    }
  }
  const completeNodeAndReturn = () => showFieldMap();

  // ---- character / equipment menu ------------------------------------------------------------------------------------
  function resistanceText(t) { return J.resistanceName(G.player.getResistance(t)); }
  function basicAttackTypesText() {
    const t = G.player.basicAttackTypes;
    return t.length === 1 ? D(t[0]) : D(t[0]) + ' + ' + D(t[1]);
  }

  function showCharacterMenu() {
    const p = G.player;
    const cv = U.newCanvas('Character Status Canvas');
    box(cv, 'Character Status Background', V(0, 0), V(1, 1), C(0.09, 0.12, 0.17));
    text(cv, 'Character Status Title', '캐릭터 상태 / 장비', 42, 4, V(0.28, 0.90), V(0.72, 0.98), GOLD);
    menuBtn(cv, 'Return To Map', '지도', V(0.86, 0.90), V(0.97, 0.98), showFieldMap);
    const PANEL = C(0.16, 0.20, 0.28);
    box(cv, 'Stats Panel', V(0.06, 0.51), V(0.48, 0.86), PANEL);
    text(cv, 'Stats Text',
      p.name + '\nHP  ' + p.currentHp + ' / ' + p.totalMaxHp + '\n'
      + 'SP  ' + p.currentSp + ' / ' + p.totalMaxSp + '\n공격력  ' + p.totalAttack + '\n방어력  ' + p.totalDefense + '\n'
      + '숙달 참격 +' + masteryBonus(DT.Slash) + ' · 관통 +' + masteryBonus(DT.Pierce) + ' · 타격 +' + masteryBonus(DT.Blunt),
      25, 3, V(0.09, 0.57), V(0.45, 0.84), WHITE);
    text(cv, 'Basic Attack Types', '기본 공격: ' + basicAttackTypesText(), 22, 3, V(0.09, 0.51), V(0.45, 0.57), WHITE);
    box(cv, 'Resistance Panel', V(0.06, 0.12), V(0.48, 0.51), PANEL);
    text(cv, 'Resistance Title', '속성 내성', 28, 4, V(0.09, 0.43), V(0.45, 0.49), GOLD);
    text(cv, 'Resistance Text',
      '참격 ' + resistanceText(DT.Slash) + '   관통 ' + resistanceText(DT.Pierce) + '   타격 ' + resistanceText(DT.Blunt)
      + '\n불 ' + resistanceText(DT.Fire) + '   물 ' + resistanceText(DT.Water) + '   바람 ' + resistanceText(DT.Wind)
      + '\n번개 ' + resistanceText(DT.Lightning) + '   땅 ' + resistanceText(DT.Earth) + '   만능 ' + resistanceText(DT.Almighty),
      20, 3, V(0.09, 0.18), V(0.45, 0.41), WHITE);
    box(cv, 'Equipment Panel', V(0.52, 0.12), V(0.94, 0.86), PANEL);
    text(cv, 'Equipped Title', '착용 장비', 28, 4, V(0.55, 0.77), V(0.91, 0.84), GOLD);
    const w = p.weapon ? p.weapon.name : '없음';
    const a = p.armor.length ? p.armor[0].name : '없음';
    text(cv, 'Equipped Text', '무기: ' + w + '\n방어구: ' + a, 23, 3, V(0.57, 0.67), V(0.89, 0.76), WHITE);
    text(cv, 'Inventory Title', '보유 장비 — 눌러서 장착', 26, 4, V(0.55, 0.57), V(0.91, 0.64), GOLD);
    let idx = 0;
    const count = G.ownedWeapons.length + G.ownedArmor.length;
    const rowH = Math.min(0.105, 0.40 / Math.max(1, count));
    const btnH = Math.min(0.075, rowH * 0.9);
    for (const eq of G.ownedWeapons) {
      const top = 0.53 - idx * rowH;
      const equipped = eq === p.weapon;
      menuBtn(cv, 'Owned Weapon ' + eq.name, eq.name + ' | ' + D(eq.weaponDamageType) + ' | 공격 +' + eq.attackBonus + ' | ' + (equipped ? '장착 중' : '장착하기'),
        V(0.56, top - btnH), V(0.90, top), () => { if (G.ownedWeapons.includes(eq)) { p.weapon = eq; showCharacterMenu(); } }).setInteractable(!equipped);
      idx++;
    }
    for (const eq of G.ownedArmor) {
      const top = 0.53 - idx * rowH;
      const equipped = p.armor.includes(eq);
      menuBtn(cv, 'Owned Armor ' + eq.name, eq.name + ' · 방어력 +' + eq.defenseBonus + ' · ' + (equipped ? '장착 중' : '장착하기'),
        V(0.56, top - btnH), V(0.90, top), () => { if (G.ownedArmor.includes(eq)) { p.armor = [eq]; showCharacterMenu(); } }).setInteractable(!equipped);
      idx++;
    }
    if (idx === 0) text(cv, 'Empty Equipment', '보유 장비가 없습니다.', 22, 4, V(0.58, 0.36), V(0.88, 0.48), WHITE);
  }

  // ==============================================================================================================
  //  Event room (suspicious traveler)
  // ==============================================================================================================
  function showSuspiciousTraveler(result) {
    const cv = U.newCanvas('Event Room Canvas');
    box(cv, 'Event Background', V(0, 0), V(1, 1), C(0.14, 0.17, 0.24));
    text(cv, 'Event Name', '수상한 나그네', 40, 4, V(0.18, 0.78), V(0.82, 0.91), WHITE);
    U.image(cv, 'Traveler Dummy Image', 'dummy', V(0.41, 0.42), V(0.59, 0.70));
    text(cv, 'Event Description', '나그네가 10골드만 달라고 한다.\n대가로 자신이 지닌 물약 중 하나를 주겠다고 한다.', 25, 4, V(0.18, 0.29), V(0.82, 0.40), WHITE);
    if (result === null) {
      text(cv, 'Traveler Gold', '보유 골드: ' + G.gold + 'G', 23, 4, V(0.35, 0.22), V(0.65, 0.28), GOLD);
      menuBtn(cv, 'Pay Traveler', '10골드 건네기', V(0.25, 0.09), V(0.48, 0.18), payTraveler).setInteractable(G.gold >= 10);
      menuBtn(cv, 'Ignore Traveler', '무시하기', V(0.52, 0.09), V(0.75, 0.18), () => showSuspiciousTraveler('나그네를 무시하고 지나갔다.'));
    } else {
      text(cv, 'Traveler Result', result, 25, 4, V(0.15, 0.19), V(0.85, 0.29), WHITE);
      menuBtn(cv, 'Event Continue', '넘어가기', V(0.38, 0.07), V(0.62, 0.16), completeNodeAndReturn);
    }
  }

  function payTraveler() {
    if (G.gold < 10) return;
    G.gold -= 10;
    const r = J.randInt(0, 100);
    const item = r < 80 ? BI.StrangePotion : r < 90 ? BI.HpPotion : BI.SpPotion;
    G.battleItems[item] = (G.battleItems[item] || 0) + 1;
    const name = item === BI.StrangePotion ? '기묘한 물약' : item === BI.HpPotion ? '체력 물약' : '기력 물약';
    showSuspiciousTraveler('10골드를 건넸다. 나그네가 ' + name + '을(를) 주었다!');
  }

  // ==============================================================================================================
  //  Shop
  // ==============================================================================================================
  function showShopRoom() {
    const cv = U.newCanvas('Shop Room Canvas');
    box(cv, 'Shop Background', V(0, 0), V(1, 1), C(0.18, 0.16, 0.13));
    text(cv, 'Shop Title', '상점', 42, 4, V(0.35, 0.82), V(0.65, 0.93), WHITE);
    text(cv, 'Shop Hint', '상인을 클릭하세요', 24, 4, V(0.30, 0.73), V(0.70, 0.82), WHITE);
    const m = U.image(cv, 'Merchant', 'merchant', V(0.40, 0.31), V(0.60, 0.70));
    m.classList.add('clickable');
    m.addEventListener('click', () => showShopMerchant(''));
  }

  function showShopMerchant(notice) {
    const cv = U.newCanvas('Merchant UI Canvas');
    box(cv, 'Merchant Background', V(0, 0), V(1, 1), C(0.14, 0.13, 0.13));
    U.image(cv, 'Merchant Portrait', 'merchant', V(0.18, 0.27), V(0.42, 0.73));
    text(cv, 'Merchant Name', '상인', 38, 4, V(0.17, 0.76), V(0.43, 0.87), WHITE);
    text(cv, 'Merchant Gold', '보유 골드: ' + G.gold + 'G', 24, 4, V(0.55, 0.63), V(0.85, 0.72), WHITE);
    if (notice) text(cv, 'Shop Notice', notice, 22, 4, V(0.51, 0.52), V(0.89, 0.61), WHITE);
    menuBtn(cv, 'Shop Buy', '구매하기', V(0.58, 0.38), V(0.82, 0.48), () => showShopPurchase(''));
    menuBtn(cv, 'Shop Exit', '나가기', V(0.58, 0.23), V(0.82, 0.33), completeNodeAndReturn);
  }

  const ownsShopWeapon = (name) => G.ownedWeapons.some((w) => w && w.name === name);

  function showShopPurchase(notice) {
    const cv = U.newCanvas('Shop Purchase Canvas');
    box(cv, 'Purchase Background', V(0, 0), V(1, 1), C(0.13, 0.16, 0.20));
    text(cv, 'Purchase Title', '상품 구매', 38, 4, V(0.30, 0.87), V(0.70, 0.96), WHITE);
    text(cv, 'Purchase Gold', '보유 골드: ' + G.gold + 'G', 24, 4, V(0.35, 0.79), V(0.65, 0.85), WHITE);
    U.image(cv, 'Shop Dummy Image', 'dummy', V(0.07, 0.82), V(0.16, 0.91));
    if (notice) text(cv, 'Purchase Notice', notice, 20, 4, V(0.18, 0.73), V(0.82, 0.78), C(0.80, 0.90, 0.76));
    const hasDummy = G.inventory.includes('더미');
    menuBtn(cv, 'Purchase Dummy', hasDummy ? '더미 · 0G · 구매 완료' : '더미 · 0G · 구매하기', V(0.16, 0.62), V(0.84, 0.71), () => {
      if (G.inventory.includes('더미')) return;
      G.inventory.push('더미');
      showShopPurchase('');
    }).setInteractable(!hasDummy);
    shopWeaponRow(cv, DT.Slash, '미트 슬레셔', '참격', 0.59, J.createMeatSlicer);
    shopWeaponRow(cv, DT.Pierce, '하트 피어싱', '관통', 0.47, J.createHeartPiercing);
    shopWeaponRow(cv, DT.Blunt, '스컬 브레이커', '타격', 0.35, J.createSkullBreaker);
    menuBtn(cv, 'Back To Merchant', '돌아가기', V(0.38, 0.06), V(0.62, 0.14), () => showShopMerchant(''));
  }

  function shopWeaponRow(cv, type, name, typeName, top, create) {
    const price = G.shopPrices[type] !== undefined ? G.shopPrices[type] : 200;
    const owned = ownsShopWeapon(name);
    menuBtn(cv, 'Shop Weapon ' + name, owned ? name + ' · ' + typeName + ' 공격 +10 · 보유 중' : name + ' · ' + typeName + ' 공격 +10 · ' + price + 'G 구매',
      V(0.16, top - 0.09), V(0.84, top), () => {
        if (G.gold < price) return;
        const w = create();
        if (ownsShopWeapon(w.name)) return;
        G.gold -= price;
        if (!G.ownedWeapons.includes(w)) G.ownedWeapons.push(w);
        showShopPurchase(w.name + ' 구매 완료 · 캐릭터/장비 메뉴에서 장착할 수 있어요.');
      }).setInteractable(!owned && G.gold >= price);
  }

  // ==============================================================================================================
  //  Rest site
  // ==============================================================================================================
  function showRestRoom(notice) {
    const cv = U.newCanvas('Rest Room Canvas');
    box(cv, 'Rest Background', V(0, 0), V(1, 1), C(0.12, 0.18, 0.16));
    text(cv, 'Rest Title', '휴식처', 42, 4, V(0.35, 0.82), V(0.65, 0.93), WHITE);
    menuBtn(cv, 'Campfire', '🔥', V(0.43, 0.52), V(0.57, 0.72), () => showRestOptions(''));
    text(cv, 'Campfire Hint', '모닥불을 클릭하세요', 24, 4, V(0.30, 0.42), V(0.70, 0.51), WHITE);
    if (notice) text(cv, 'Rest Notice', notice, 22, 4, V(0.25, 0.30), V(0.75, 0.38), WHITE);
  }

  function showRestOptions(notice) {
    const p = G.player;
    const cv = U.newCanvas('Rest Options Canvas');
    box(cv, 'Rest Options Background', V(0, 0), V(1, 1), C(0.12, 0.18, 0.16));
    text(cv, 'Rest Options Title', '모닥불 곁에서 무엇을 할까?', 34, 4, V(0.20, 0.78), V(0.80, 0.90), WHITE);
    menuBtn(cv, 'Upgrade Equipment', G.upgradeUsed ? '강화 완료' : '강화하기', V(0.36, 0.62), V(0.64, 0.72), () => showRestUpgradeMenu('')).setInteractable(!G.upgradeUsed);
    const hp = Math.min(Math.ceil(p.totalMaxHp * 0.2), p.totalMaxHp - p.currentHp);
    const sp = Math.min(Math.ceil(p.totalMaxSp * 0.5), p.totalMaxSp - p.currentSp);
    const heal = menuBtn(cv, 'Rest Heal', G.restUsed ? '휴식 완료' : '휴식하기', V(0.36, 0.40), V(0.64, 0.50), restAndShowResult);
    const tip = text(cv, 'Rest Tooltip', 'HP +' + hp + ' · SP +' + sp + ' 회복\n(HP 최대치 20%, SP 최대치 50%)', 21, 4, V(0.25, 0.50), V(0.75, 0.59), WHITE);
    tip.style.display = 'none';
    heal.setInteractable(!G.restUsed);
    if (!G.restUsed) {
      const show = () => { tip.style.display = 'flex'; U.fitOne(tip); };
      heal.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') show(); });
      heal.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
      // touch screens have no hover, so the recovery preview is simply shown
      if (window.matchMedia && !window.matchMedia('(hover: hover)').matches) requestAnimationFrame(show);
    }
    if (notice) text(cv, 'Rest Notice', notice, 22, 4, V(0.22, 0.26), V(0.78, 0.34), WHITE);
    menuBtn(cv, 'Rest Continue', '다음 방으로', V(0.38, 0.10), V(0.62, 0.20), completeNodeAndReturn);
  }

  function restAndShowResult() {
    if (G.restUsed) return;
    G.restUsed = true;
    const hp = J.recoverHp(G.player), sp = J.recoverSp(G.player);
    showRestOptions('HP를 ' + hp + ', SP를 ' + sp + ' 회복했습니다.');
  }

  const baseEquipmentName = (n) => { const i = n.lastIndexOf('+'); return i > 0 && /^-?\d+$/.test(n.slice(i + 1)) ? n.slice(0, i) : n; };

  function showRestUpgradeMenu(notice) {
    const p = G.player;
    const cv = U.newCanvas('Equipment Upgrade Canvas');
    box(cv, 'Upgrade Background', V(0, 0), V(1, 1), C(0.12, 0.18, 0.16));
    text(cv, 'Upgrade Title', '강화할 장비를 선택하세요', 35, 4, V(0.20, 0.78), V(0.80, 0.90), WHITE);
    if (notice) text(cv, 'Upgrade Notice', notice, 22, 4, V(0.22, 0.68), V(0.78, 0.76), C(0.76, 0.91, 0.75));
    const list = [];
    if (p.weapon) list.push(p.weapon);
    for (const a of p.armor) if (a) list.push(a);
    let n = 0;
    for (const eq of list) {
      if (G.upgradeUsed || G.upgradedAtRest.has(eq)) continue;
      n++;
      const y = 0.54 - n * 0.16;
      const stat = eq.isWeapon ? '공격력 +' + eq.attackBonus : '방어력 +' + eq.defenseBonus;
      menuBtn(cv, 'Upgrade ' + eq.name, eq.name + '  (' + stat + ') 강화', V(0.28, y), V(0.72, y + 0.10), () => upgradeEquipment(eq));
    }
    if (n === 0) text(cv, 'No Upgrades', '이번 휴식처에서 강화할 수 있는 장비가 없습니다.', 23, 4, V(0.20, 0.43), V(0.80, 0.56), WHITE);
    menuBtn(cv, 'Upgrade Back', '돌아가기', V(0.38, 0.12), V(0.62, 0.22), () => showRestOptions(''));
  }

  function upgradeEquipment(eq) {
    if (!eq || G.upgradeUsed || G.upgradedAtRest.has(eq)) return;
    eq.upgradeLevel++;
    eq.name = baseEquipmentName(eq.name) + '+' + eq.upgradeLevel;
    if (eq.isWeapon) eq.attackBonus += 4;
    else { eq.defenseBonus += 3; J.setResistance(eq, DT.Fire, RL.Normal); }
    G.upgradedAtRest.add(eq);
    G.upgradeUsed = true;
    showRestUpgradeMenu(eq.name + ' 강화 완료!');
  }

  // ==============================================================================================================
  //  Settlement
  // ==============================================================================================================
  function endRun(won) {
    if (G.runSettled) return;
    G.runSettled = true;
    const nodes = G.visited.size * 10;
    const hard = G.hardBattleCount * 10;
    const boss = G.bossDefeated ? 100 : 0;
    const total = nodes + hard + boss + G.eventGoldEarned;
    G.metaGold += total;
    Prefs.set('MetaGold', G.metaGold);
    const cv = U.newCanvas('Journey Settlement Canvas');
    box(cv, 'Settlement Background', V(0, 0), V(1, 1), C(0.08, 0.10, 0.15));
    text(cv, 'Settlement Title', won ? '여정 완료!' : '여정 종료', 46, 4, V(0.25, 0.79), V(0.75, 0.91), won ? GOLD : WHITE);
    text(cv, 'Settlement Summary',
      '진행 노드 ' + G.visited.size + '개  × 10G     +' + nodes + 'G\n'
      + '어려운 전투 ' + G.hardBattleCount + '회  × 10G     +' + hard + 'G\n'
      + '보스 처치 ' + (G.bossDefeated ? '성공' : '실패') + '             +' + boss + 'G\n'
      + '이벤트 골드                     +' + G.eventGoldEarned + 'G',
      27, 4, V(0.20, 0.44), V(0.80, 0.72), WHITE);
    text(cv, 'Settlement Total', '이번 정산: +' + total + 'G     영구 골드: ' + G.metaGold + 'G', 31, 4, V(0.20, 0.32), V(0.80, 0.41), GOLD);
    menuBtn(cv, 'Settlement To Title', '타이틀로', V(0.38, 0.15), V(0.62, 0.25), showMainMenu);
  }

  // ==============================================================================================================
  //  Battle
  // ==============================================================================================================
  function buildBattle(title, def) {
    G.enemies = [];
    G.playerTurn = false; G.battleOver = false;
    G.incIncrease = 0; G.incTurns = 0; G.atkReduction = 0; G.atkTurns = 0; G.playerStunnedNext = false;
    G.pendingDouble = false; G.pendingCowardly = false; G.pendingMagicType = null; G.pendingMagicMult = 1.0; G.pendingMagicSp = 0; G.pendingStrangeThrow = false;
    const cv = U.newCanvas('Battle Canvas');
    box(cv, 'Battlefield', V(0, 0.44), V(1, 1), C(0.16, 0.20, 0.29));
    box(cv, 'Party Area', V(0, 0), V(1, 0.44), C(0.10, 0.12, 0.18));
    box(cv, 'Divider', V(0, 0.435), V(1, 0.445), C(0.88, 0.71, 0.39));
    G.message = text(cv, 'Battle Message', title + '에 들어섰다!', 38, 4, V(0.12, 0.84), V(0.88, 0.96), WHITE);
    text(cv, 'Enemy Heading', 'ENCOUNTER', 24, 4, V(0.35, 0.91), V(0.65, 0.98), C(0.96, 0.78, 0.48));
    createPlayerCard(cv);
    createEnemy(cv, def || J.createSkeletonKnight(), V(0.5, 0.58));
    beginPlayerTurn();
  }

  function createPlayerCard(parent) {
    const card = box(parent, 'Player Card', V(0.17, 0.035), V(0.83, 0.34), C(0.17, 0.20, 0.28));
    G.playerCard = card;
    U.image(card, 'Portrait', 'player', V(0.035, 0.12), V(0.235, 0.88));
    text(card, 'Player Name', '주인공', 33, 3, V(0.28, 0.64), V(0.53, 0.90), WHITE);
    text(card, 'HP Label', 'HP', 24, 3, V(0.28, 0.40), V(0.34, 0.62), WHITE);
    text(card, 'SP Label', 'SP', 24, 3, V(0.28, 0.16), V(0.34, 0.38), WHITE);
    card.hpBar = U.bar(card, 'HP Bar', V(0.35, 0.45), V(0.78, 0.59), C(0.84, 0.29, 0.32));
    card.spBar = U.bar(card, 'SP Bar', V(0.35, 0.21), V(0.78, 0.35), C(0.30, 0.58, 0.91));
    card.hpValue = text(card, 'HP Value', '', 23, 5, V(0.79, 0.43), V(0.97, 0.61), WHITE);
    card.spValue = text(card, 'SP Value', '', 23, 5, V(0.79, 0.19), V(0.97, 0.37), WHITE);
    G.commandRoot = box(parent, 'Command UI', V(0.04, 0.30), V(0.34, 0.83), C(0.08, 0.10, 0.15, 0.96));
    G.commandRoot.style.display = 'none';
    refreshPlayerCard();
  }

  function refreshPlayerCard() {
    const c = G.playerCard, p = G.player;
    if (!c) return;
    U.setBar(c.hpBar, p.currentHp / p.totalMaxHp);
    U.setBar(c.spBar, p.currentSp / Math.max(1, p.totalMaxSp));
    c.hpValue.setText(p.currentHp + ' / ' + p.totalMaxHp);
    c.spValue.setText(p.currentSp + ' / ' + p.totalMaxSp);
  }

  function createEnemy(parent, def, pos) {
    const view = { stats: J.createEnemyCombatant(def), def, plannedAction: null, isDefending: false, isStunned: false, pendingDamageIncrease: 0 };
    const w = 0.30;
    const root = box(parent, def.enemyName + ' Target', V(pos.x - w / 2, 0.35), V(pos.x + w / 2, 0.85), C(0.22, 0.25, 0.34));
    view.root = root;
    U.makeButton(root, () => selectEnemy(view));
    view.button = root;
    text(root, 'Enemy Name', def.enemyName, 31, 4, V(0.08, 0.91), V(0.92, 0.98), WHITE);
    view.intentLabel = text(root, 'Enemy Intent', '행동 예고: 준비 중', 18, 4, V(0.05, 0.83), V(0.95, 0.90), C(1.0, 0.86, 0.56));
    view.portrait = U.image(root, 'Enemy Portrait', J.ENEMY_PORTRAIT[def.enemyName] || 'dummy', V(0.10, 0.18), V(0.90, 0.82));
    view.hpBar = U.bar(root, 'Enemy HP Bar', V(0.12, 0.06), V(0.88, 0.16), C(0.84, 0.29, 0.32));
    view.hpText = text(root, 'Enemy HP Text', '', 19, 4, V(0.15, 0.055), V(0.85, 0.17), WHITE);
    G.enemies.push(view);
    refreshEnemy(view);
  }

  function refreshEnemy(v) {
    U.setBar(v.hpBar, v.stats.currentHp / v.stats.maxHp);
    v.hpText.setText('HP ' + v.stats.currentHp + ' / ' + v.stats.maxHp);
    if (v.stats.currentHp <= 0) {
      v.button.setInteractable(false);
      U.setColor(v.root, C(0.13, 0.14, 0.18));
      v.portrait.img.style.filter = 'brightness(0.56)';
    }
  }

  const setMessage = (t) => G.message.setText(t);
  const setCommandsVisible = (b) => { G.commandRoot.style.display = b ? 'block' : 'none'; };
  const allEnemiesDefeated = () => G.enemies.every((e) => e.stats.currentHp <= 0);
  const battleItemCount = (t) => G.battleItems[t] || 0;
  function consumeBattleItem(t) { const n = battleItemCount(t); if (n <= 0) return false; G.battleItems[t] = n - 1; return true; }

  function chooseAndPlan() {
    for (const v of G.enemies) {
      if (v.stats.currentHp <= 0) continue;
      v.plannedAction = J.chooseAction(v.def.actions);
      v.isDefending = v.plannedAction.type === AT.Defend;
      v.intentLabel.setText('예고: ' + J.intentText(v));
    }
  }

  function beginPlayerTurn() {
    if (G.battleOver) return;
    chooseAndPlan();
    if (G.playerStunnedNext) {
      G.playerStunnedNext = false;
      G.playerTurn = false;
      setCommandsVisible(false);
      setMessage('주인공은 기절해 이번 턴을 건너뛴다!');
      advancePlayerAttackDebuffTurn();
      enemyTurn();
      return;
    }
    G.playerTurn = true;
    const e0 = G.enemies[0];
    setMessage(G.enemies.length > 0 && e0.plannedAction ? '주인공의 차례다. ' + e0.stats.name + '의 예고: ' + J.intentText(e0) : '주인공의 차례다. 명령을 선택해줘.');
    setCommandsVisible(true);
    showMainCommands();
    refreshPlayerCard();
  }

  // ---- command lists -------------------------------------------------------------------------------------------------------
  function beginCommandList(n) {
    G.commandRoot.textContent = '';
    G.commandIndex = 0;
    G.commandRowCount = Math.max(1, n);
  }
  function addCommand(label, fn) {
    const i = G.commandIndex++;
    const n = G.commandRowCount;
    const h = (0.95 - 0.018 * (n - 1)) / n;
    const y = (0.975 - h * (i + 1)) - 0.018 * i;
    const b = box(G.commandRoot, 'Command ' + label, V(0.035, y), V(0.965, y + h), C(0.24, 0.29, 0.39));
    U.makeButton(b, fn);
    text(b, 'Text', label, n >= 6 ? 22 : 29, 4, V(0, 0), V(1, 1), WHITE);
    U.fit(b);
    return b;
  }

  function showMainCommands() {
    beginCommandList(3);
    addCommand('공격', () => startTargetSelection(false, false));
    addCommand('스킬', showSkillCommands);
    addCommand('아이템', showItemCommands);
  }
  function showItemCommands() {
    beginCommandList(4);
    addCommand('기력 물약 × ' + battleItemCount(BI.SpPotion) + ' · SP +30', () => usePotion(BI.SpPotion));
    addCommand('체력 물약 × ' + battleItemCount(BI.HpPotion) + ' · HP +50', () => usePotion(BI.HpPotion));
    addCommand('기묘한 물약 × ' + battleItemCount(BI.StrangePotion), showStrangePotionCommands);
    addCommand('뒤로', showMainCommands);
  }
  function showStrangePotionCommands() {
    beginCommandList(3);
    addCommand('마시기 · 효과는 불명', () => resolveStrangePotion(false, null));
    addCommand('던지기 · 적 선택', startStrangePotionThrow);
    addCommand('뒤로', showItemCommands);
  }
  function showSkillCommands() {
    beginCommandList(4);
    addCommand('이연격 · SP 10', () => startTargetSelection(true, false));
    addCommand('비겁한 일격 · SP 5', () => startTargetSelection(false, true));
    addCommand('마법', showMagicCommands);
    addCommand('뒤로', showMainCommands);
  }
  function showMagicCommands() {
    const unlocked = J.AVAILABLE_ELEMENTS.filter(isMagicUnlocked);
    const all = hasAllMagic();
    beginCommandList(unlocked.length + (all ? 1 : 0) + (unlocked.length === 0 ? 1 : 0) + 1);
    for (const t of unlocked) addCommand(D(t) + ' 마법 · SP 10', () => startMagicSpell(t, 1.0, 10));
    if (all) addCommand('매기도 · SP 30', () => startMagicSpell(DT.Almighty, 2.0, 30));
    if (unlocked.length === 0) addCommand('해금된 마법이 없습니다', () => {});
    addCommand('뒤로', showSkillCommands);
  }

  function setEnemyTargetable(on) {
    for (const v of G.enemies) v.button.setInteractable(on ? v.stats.currentHp > 0 : false);
  }

  // ---- player actions --------------------------------------------------------------------------------------------------------
  function usePotion(type) {
    if (!G.playerTurn || !consumeBattleItem(type)) return;
    G.playerTurn = false;
    const p = G.player;
    if (type === BI.SpPotion) {
      const v = Math.min(30, p.totalMaxSp - p.currentSp);
      p.currentSp += v;
      setMessage(v <= 0 ? '기력 물약을 사용했지만 SP가 이미 가득 차 있다.' : '기력 물약을 사용해 SP ' + v + ' 회복했다.');
    } else {
      const v = Math.min(50, p.totalMaxHp - p.currentHp);
      p.currentHp += v;
      setMessage(v <= 0 ? '체력 물약을 사용했지만 HP가 이미 가득 차 있다.' : '체력 물약을 사용해 HP ' + v + ' 회복했다.');
    }
    advancePlayerAttackDebuffTurn();
    refreshPlayerCard();
    setCommandsVisible(false);
    enemyTurn();
  }

  function startStrangePotionThrow() {
    if (!G.playerTurn || battleItemCount(BI.StrangePotion) <= 0) return;
    G.pendingStrangeThrow = true;
    setMessage('기묘한 물약을 던질 적을 선택해줘.');
    setEnemyTargetable(true);
  }

  function resolveStrangePotion(thrown, target) {
    if (!G.playerTurn || !consumeBattleItem(BI.StrangePotion)) return;
    G.playerTurn = false;
    const p = G.player;
    const r = J.randInt(0, 5);
    if (thrown) {
      const s = target.stats;
      if (r === 0) {
        const v = Math.min(50, s.maxHp - s.currentHp);
        s.currentHp += v;
        setMessage(v <= 0 ? '기묘한 물약을 맞은 적은 이미 체력이 가득하다.' : '기묘한 물약의 효과! 적의 HP가 ' + v + ' 회복됐다.');
      } else if (r === 1) {
        setMessage('기묘한 물약이 깨졌다. 아무 일도 일어나지 않았다.');
      } else if (r === 2) {
        target.isStunned = true;
        setMessage('기묘한 물약의 효과! ' + s.name + '이(가) 기절했다.');
      } else {
        s.currentHp = Math.max(0, s.currentHp - 30);
        setMessage('기묘한 물약의 효과! ' + s.name + '에게 30 피해!');
      }
      refreshEnemy(target);
    } else {
      if (r === 0) {
        const v = Math.min(50, p.totalMaxHp - p.currentHp);
        p.currentHp += v;
        setMessage(v <= 0 ? '기묘한 물약을 마셨지만 HP가 이미 가득 차 있다.' : '기묘한 물약의 효과! HP ' + v + ' 회복!');
      } else if (r === 1) {
        setMessage('기묘한 물약을 마셨지만 아무 일도 일어나지 않았다.');
      } else if (r === 2) {
        G.playerStunnedNext = true;
        setMessage('기묘한 물약의 효과! 다음 주인공 턴에 기절한다.');
      } else if (r === 3) {
        p.takeDamage(30);
        setMessage('기묘한 물약의 효과! HP 30 감소!');
      } else {
        p.currentHp = p.totalMaxHp; p.currentSp = p.totalMaxSp;
        setMessage('기묘한 물약의 효과! HP와 SP가 모두 완전히 회복됐다.');
      }
      refreshPlayerCard();
    }
    G.pendingStrangeThrow = false;
    setEnemyTargetable(false);
    setCommandsVisible(false);
    advancePlayerAttackDebuffTurn();
    if (p.currentHp <= 0) { finishBattle('주인공은 쓰러졌다...', false); return; }
    if (allEnemiesDefeated()) { finishBattle('전투에서 승리했다!', true); return; }
    enemyTurn();
  }

  function startMagicSpell(type, mult, sp) {
    if (!G.playerTurn || G.battleOver) return;
    if (!(type === DT.Almighty ? hasAllMagic() : isMagicUnlocked(type))) return;
    if (G.player.currentSp < sp) { setMessage('마법을 사용하기에는 기력이 부족하다. (SP ' + sp + ' 필요)'); return; }
    G.pendingDouble = false; G.pendingCowardly = false;
    G.pendingMagicType = type; G.pendingMagicMult = mult; G.pendingMagicSp = sp;
    setMessage((type === DT.Almighty ? '매기도' : D(type) + ' 마법') + '을(를) 사용할 적을 선택해줘.');
    setEnemyTargetable(true);
  }

  function startTargetSelection(double, cowardly) {
    if (double && G.player.currentSp < 10) { setMessage('이연격을 사용하기에는 기력이 부족하다. (SP 10 필요)'); return; }
    if (cowardly && G.player.currentSp < 5) { setMessage('비겁한 일격을 사용하기에는 기력이 부족하다. (SP 5 필요)'); return; }
    G.pendingDouble = double; G.pendingCowardly = cowardly;
    G.pendingMagicType = null; G.pendingMagicMult = 1.0; G.pendingMagicSp = 0;
    setMessage(double ? '이연격을 사용할 적을 선택해줘.' : cowardly ? '비겁한 일격을 사용할 적을 선택해줘.' : '공격할 적을 선택해줘.');
    setEnemyTargetable(true);
  }

  function calculatePlayerHit(view, type, mult, ignoreDefense) {
    const p = G.player;
    const atkFactor = J.f(1.0 - (G.atkTurns > 0 ? G.atkReduction : 0));
    let dmg;
    if (type !== null) {
      dmg = J.calculate(p, view.stats, type, mult, 0.0, masteryBonus(type), ignoreDefense, atkFactor);
    } else {
      const types = p.basicAttackTypes;
      let flat = 0;
      for (const t of types) flat += masteryBonus(t);
      dmg = J.calculate(p, view.stats, types, mult, 0.0, flat, ignoreDefense, atkFactor);
    }
    if (view.isDefending && view.plannedAction) {
      dmg = Math.floor(J.f(dmg * J.f(1.0 - view.plannedAction.damageReduction)));
      dmg = Math.max(0, dmg - view.plannedAction.flatDamageReduction);
    }
    return Math.max(0, dmg);
  }

  function advancePlayerAttackDebuffTurn() {
    if (G.atkTurns <= 0) return;
    G.atkTurns--;
    if (G.atkTurns <= 0) G.atkReduction = 0;
  }
  function applyPlayerHit(view, dmg) {
    view.stats.currentHp = Math.max(0, view.stats.currentHp - dmg);
    refreshEnemy(view);
  }

  function selectEnemy(view) {
    if (!G.playerTurn || G.battleOver || view.stats.currentHp <= 0) return;
    if (G.pendingStrangeThrow) { resolveStrangePotion(true, view); return; }
    G.playerTurn = false;
    setEnemyTargetable(false);
    const p = G.player;
    if (G.pendingDouble) {
      p.currentSp -= 10;
      refreshPlayerCard();
      const d1 = calculatePlayerHit(view, null, 1.0, false);
      applyPlayerHit(view, d1);
      if (view.stats.currentHp > 0) {
        const d2 = calculatePlayerHit(view, null, 1.0, false);
        applyPlayerHit(view, d2);
        setMessage('이연격! 1타 ' + d1 + ' 피해, 2타 ' + d2 + ' 피해!');
      } else {
        setMessage('이연격! 1타 ' + d1 + ' 피해로 ' + view.stats.name + '을(를) 쓰러뜨렸다. 2타는 취소됐다.');
      }
    } else if (G.pendingCowardly) {
      p.currentSp -= 5;
      refreshPlayerCard();
      const d = calculatePlayerHit(view, DT.Pierce, 0.75, true);
      applyPlayerHit(view, d);
      setMessage('비겁한 일격! ' + view.stats.name + '에게 관통 피해 ' + d + '!');
    } else if (G.pendingMagicType !== null) {
      p.currentSp -= G.pendingMagicSp;
      refreshPlayerCard();
      const d = calculatePlayerHit(view, G.pendingMagicType, G.pendingMagicMult, false);
      applyPlayerHit(view, d);
      const nm = G.pendingMagicType === DT.Almighty ? '매기도' : D(G.pendingMagicType) + ' 마법';
      setMessage(nm + '! ' + view.stats.name + '에게 ' + d + ' 피해!');
    } else {
      const d = calculatePlayerHit(view, null, 1.0, false);
      applyPlayerHit(view, d);
      setMessage('주인공의 공격! ' + view.stats.name + '에게 ' + d + '의 피해!');
    }
    G.pendingDouble = false; G.pendingCowardly = false; G.pendingMagicType = null; G.pendingMagicMult = 1.0; G.pendingMagicSp = 0;
    setCommandsVisible(false);
    advancePlayerAttackDebuffTurn();
    if (allEnemiesDefeated()) { finishBattle('전투에서 승리했다!', true); return; }
    enemyTurn();
  }

  // ---- enemy turn (coroutine in the original) ------------------------------------------------------------------------------------
  async function enemyTurn() {
    await U.sleep(750);
    const p = G.player;
    for (const v of G.enemies) {
      if (v.stats.currentHp <= 0 || G.battleOver) continue;
      if (v.isStunned) {
        v.isStunned = false;
        setMessage(v.stats.name + '은(는) 기절해 행동하지 못했다.');
        await U.sleep(800);
        continue;
      }
      const a = v.plannedAction;
      if (!a) continue;
      const hadIncrease = G.incTurns > 0;
      let newDebuff = false;
      switch (a.type) {
        case AT.Attack: {
          let d = J.calculate(v.stats, p, a.damageType, a.damageMultiplier, 0.0, 0, false, 1.0);
          if (v.pendingDamageIncrease > 0) { d = Math.floor(J.f(d * J.f(1.0 + v.pendingDamageIncrease))); v.pendingDamageIncrease = 0; }
          if (G.incTurns > 0) d = Math.floor(J.f(d * J.f(1.0 + G.incIncrease)));
          p.takeDamage(d);
          refreshPlayerCard();
          setMessage(v.stats.name + '의 ' + a.actionName + '! ' + d + '의 피해를 입었다.');
          break;
        }
        case AT.Defend:
          setMessage(v.stats.name + '이(가) 방어 태세를 취했다.');
          break;
        case AT.Buff:
          v.pendingDamageIncrease = a.damageIncrease;
          setMessage(v.stats.name + '이(가) 다음 공격을 강화했다.');
          break;
        case AT.Debuff:
          G.incIncrease = a.damageIncrease; G.incTurns = a.statusDurationTurns; newDebuff = true;
          setMessage(v.stats.name + '의 약화 마법! 다음 2턴 동안 받는 피해가 20% 증가한다.');
          break;
        case AT.AttackDebuff:
          G.atkReduction = a.damageIncrease; G.atkTurns = a.statusDurationTurns;
          setMessage(v.stats.name + '의 시선! 다음 3턴 동안 공격력이 15% 약화된다.');
          break;
        default:
          setMessage(v.stats.name + '은(는) 지쳐 움직이지 못했다.');
      }
      if (hadIncrease && !newDebuff) {
        G.incTurns--;
        if (G.incTurns <= 0) G.incIncrease = 0;
      }
      await U.sleep(800);
      if (p.currentHp <= 0) { finishBattle('주인공은 쓰러졌다...', false); return; }
    }
    beginPlayerTurn();
  }

  function finishBattle(msg, won) {
    G.battleOver = true; G.playerTurn = false;
    setCommandsVisible(false);
    setEnemyTargetable(false);
    if (!won) { setMessage(msg); endRun(false); return; }
    const node = G.nodes[G.currentNodeId];
    if (node.type === RT.Boss) { setMessage(msg); G.bossDefeated = true; endRun(true); return; }
    let reward = 0;
    if (node.type === RT.Battle) reward = J.randInt(50, 101);
    else if (node.type === RT.HardBattle) reward = J.randInt(75, 151);
    G.gold += reward;
    setMessage(msg + '  여정 골드 ' + reward + 'G 획득!');
    const cv = U.stage.querySelector('.canvas');
    menuBtn(cv, 'Return To Map', '지도 보기', V(0.38, 0.35), V(0.62, 0.44), showFieldMap);
    U.fit(cv);
  }

  // ---- boot ----------------------------------------------------------------------------------------------------------------------------
  window.JRPG.start = start;
  window.JRPG.screens = { showMainMenu, showFieldMap, showCharacterMenu, showRebirthShop };
})();
