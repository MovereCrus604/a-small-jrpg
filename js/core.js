/*
 * A SMALL JRPG - core rules (pure logic, no DOM)
 *
 * Re-implementation of SimpleJrpg.Combat.* from the original Unity build.
 * All numbers are taken from the original assembly. Arithmetic that the original
 * did in 32-bit float is wrapped in Math.fround so results match exactly.
 */
(function (global) {
  'use strict';
  const f = Math.fround;

  // ---- enums (same numeric values as the original) -------------------------
  const DT = Object.freeze({ Slash: 0, Pierce: 1, Blunt: 2, Fire: 3, Water: 4, Wind: 5, Lightning: 6, Earth: 7, Almighty: 8 });
  const RL = Object.freeze({ Vulnerable: 0, Weak: 1, Normal: 2, Resistant: 3, Immune: 4 });
  const AT = Object.freeze({ Attack: 0, Defend: 1, Buff: 2, Debuff: 3, AttackDebuff: 4, Wait: 5 });
  const RT = Object.freeze({ Event: 0, Battle: 1, HardBattle: 2, Rest: 3, Shop: 4, Boss: 5 });
  const BI = Object.freeze({ SpPotion: 0, HpPotion: 1, StrangePotion: 2 });

  const DAMAGE_NAMES = ['참격', '관통', '타격', '불', '물', '바람', '번개', '땅', '만능'];
  const damageTypeName = (t) => (t >= 0 && t <= 7 ? DAMAGE_NAMES[t] : '만능');
  const resistanceName = (l) => ['취약', '약점', '보통', '내성', '무효'][l] || '보통';
  const AVAILABLE_ELEMENTS = Object.freeze([DT.Fire, DT.Water, DT.Wind, DT.Lightning, DT.Earth]);

  // ---- RNG (replaceable for tests) ------------------------------------------
  let rng = Math.random;
  const setRng = (fn) => { rng = fn; };
  const randInt = (min, maxExclusive) => min + Math.floor(rng() * (maxExclusive - min)); // Random.Range(int,int)
  const randFloat = (min, max) => min + rng() * (max - min);                              // Random.Range(float,float)
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  // ---- data classes -----------------------------------------------------------
  class Equipment {
    constructor(name, isWeapon) {
      this.name = name || '';
      this.isWeapon = !!isWeapon;
      this.weaponDamageType = DT.Blunt; // default of the original field
      this.attackBonus = 0;
      this.defenseBonus = 0;
      this.hpBonus = 0;
      this.spBonus = 0;
      this.upgradeLevel = 0;
      this.resist = []; // [{type, level}]
    }
  }

  function setResistance(eq, type, level) {
    for (const r of eq.resist) { if (r.type === type) { r.level = level; return; } }
    eq.resist.push({ type, level });
  }
  function applyResistance(eq, type, cur) {
    if (!eq || !eq.resist) return cur;
    for (const r of eq.resist) if (r && r.type === type) cur = r.level;
    return cur;
  }

  class Combatant {
    constructor() {
      this.name = 'Player';
      this.maxHp = 150; this.maxSp = 40; this.attack = 20; this.defense = 15;
      this.currentHp = 150; this.currentSp = 40;
      this.weapon = null;
      this.enchant = null; // DamageType or null
      this.armor = [];
    }
    _sum(fn) {
      let v = this.weapon ? fn(this.weapon) : 0;
      for (const a of this.armor) if (a) v += fn(a);
      return v;
    }
    get totalMaxHp() { return this.maxHp + this._sum((e) => e.hpBonus); }
    get totalMaxSp() { return this.maxSp + this._sum((e) => e.spBonus); }
    get totalAttack() { return this.attack + this._sum((e) => e.attackBonus); }
    get totalDefense() { return this.defense + this._sum((e) => e.defenseBonus); }
    get basicAttackType() { return this.weapon && this.weapon.isWeapon ? this.weapon.weaponDamageType : DT.Blunt; }
    get basicAttackTypes() { return this.enchant == null ? [this.basicAttackType] : [this.basicAttackType, this.enchant]; }
    initializeResources() { this.currentHp = this.totalMaxHp; this.currentSp = this.totalMaxSp; }
    getResistance(type) {
      let lvl = RL.Normal;
      lvl = applyResistance(this.weapon, type, lvl);
      for (const a of this.armor) lvl = applyResistance(a, type, lvl);
      return lvl;
    }
    takeDamage(n) { const d = clamp(n, 0, this.currentHp); this.currentHp -= d; return d; }
  }

  // ---- damage calculator (DamageCalculator.Calculate) ----------------------------
  const damageMultiplier = (l) => (l === RL.Vulnerable ? 2.0 : l === RL.Weak ? 1.5 : l === RL.Resistant ? 0.5 : l === RL.Immune ? 0.0 : 1.0);
  const defenseMultiplier = (l) => (l === RL.Vulnerable ? 0.5 : l === RL.Weak ? 0.75 : l === RL.Resistant ? 1.5 : l === RL.Immune ? 0.0 : 1.0);

  function calculate(attacker, target, types, mult, extra, flat, ignoreDefense, atkFactor) {
    if (!Array.isArray(types)) types = [types];
    if (types.length === 0) throw new Error('At least one damage type is required.');
    let v0 = 1.0, v1 = 1.0;
    for (const t of types) {
      const r = target.getResistance(t);
      if (r === RL.Immune) return 0;
      v0 = f(v0 * damageMultiplier(r));
      v1 = f(v1 * defenseMultiplier(r));
    }
    let v2 = f(f(f(f(attacker.totalAttack * f(atkFactor)) * f(f(mult) + f(extra))) + flat) * v0);
    if (!ignoreDefense) v2 = f(v2 - f(target.totalDefense * v1));
    return Math.max(0, Math.floor(v2));
  }

  // ---- equipment factories (StartingEquipment) --------------------------------------
  function createWeapon(name, type, atk) {
    const e = new Equipment(name, true); e.weaponDamageType = type; e.attackBonus = atk; return e;
  }
  const createLongsword = () => createWeapon('롱소드', DT.Slash, 5);
  const createRapier = () => createWeapon('레이피어', DT.Pierce, 5);
  const createMace = () => createWeapon('메이스', DT.Blunt, 5);
  const createMeatSlicer = () => createWeapon('미트 슬레셔', DT.Slash, 10);
  const createHeartPiercing = () => createWeapon('하트 피어싱', DT.Pierce, 10);
  const createSkullBreaker = () => createWeapon('스컬 브레이커', DT.Blunt, 10);
  function createClothArmor() {
    const e = new Equipment('천갑옷', false);
    for (const t of [DT.Slash, DT.Pierce, DT.Blunt]) e.resist.push({ type: t, level: RL.Normal });
    for (const t of AVAILABLE_ELEMENTS) e.resist.push({ type: t, level: RL.Weak });
    return e;
  }

  // ---- enemies (EnemyDefinition) ---------------------------------------------------------
  function act(o) {
    return Object.assign({ actionName: '', type: AT.Attack, selectionWeight: 0, damageType: DT.Slash, damageMultiplier: 1.0,
      damageReduction: 0, flatDamageReduction: 0, damageIncrease: 0, statusDurationTurns: 0 }, o);
  }
  const R = (type, level) => ({ type, level });

  function createSkeletonKnight() {
    return {
      enemyName: '해골 기사', maxHp: 45, attack: 15, defense: 12,
      resistances: [R(DT.Blunt, RL.Weak), R(DT.Lightning, RL.Resistant), R(DT.Earth, RL.Vulnerable)],
      actions: [
        act({ actionName: '가벼운 공격', type: AT.Attack, selectionWeight: 3.0, damageType: DT.Slash, damageMultiplier: 1.0 }),
        act({ actionName: '강력한 공격', type: AT.Attack, selectionWeight: 1.0, damageType: DT.Slash, damageMultiplier: 1.5 }),
        act({ actionName: '방어적 행동', type: AT.Defend, selectionWeight: 1.0, damageReduction: f(0.2) }),
        act({ actionName: '버프적 행동', type: AT.Buff, selectionWeight: 2.0, damageIncrease: f(0.2) }),
        act({ actionName: '지침', type: AT.Wait, selectionWeight: 0.5 }),
      ],
    };
  }
  function createSkeletonShieldBearer() {
    return {
      enemyName: '해골 방패병', maxHp: 55, attack: 12, defense: 16,
      resistances: [R(DT.Fire, RL.Resistant)],
      actions: [
        act({ actionName: '방패 밀기', type: AT.Attack, selectionWeight: 1.0, damageType: DT.Blunt, damageMultiplier: 1.0 }),
        act({ actionName: '방패 들기', type: AT.Defend, selectionWeight: 1.0, flatDamageReduction: 5 }),
        act({ actionName: '방패 돌진', type: AT.Attack, selectionWeight: 1.0, damageType: DT.Blunt, damageMultiplier: 2.0 }),
      ],
    };
  }
  function createSkeletonMage() {
    return {
      enemyName: '해골 마법사', maxHp: 60, attack: 20, defense: 12,
      resistances: [
        R(DT.Slash, RL.Weak), R(DT.Pierce, RL.Weak), R(DT.Blunt, RL.Weak),
        R(DT.Fire, RL.Resistant), R(DT.Water, RL.Resistant), R(DT.Wind, RL.Resistant),
        R(DT.Lightning, RL.Resistant), R(DT.Earth, RL.Resistant),
      ],
      actions: [
        act({ actionName: '화염 마법', type: AT.Attack, selectionWeight: 1.0, damageType: DT.Fire, damageMultiplier: 1.0 }),
        act({ actionName: '급류 마법', type: AT.Attack, selectionWeight: 1.0, damageType: DT.Water, damageMultiplier: 1.0 }),
        act({ actionName: '집중', type: AT.Buff, selectionWeight: 1.0, damageIncrease: f(0.2) }),
        act({ actionName: '약화 마법', type: AT.Debuff, selectionWeight: 1.0, damageIncrease: f(0.2), statusDurationTurns: 2 }),
      ],
    };
  }
  function createSkeletonLord() {
    return {
      enemyName: '해골 군주', maxHp: 150, attack: 30, defense: 18,
      resistances: [R(DT.Fire, RL.Weak), R(DT.Earth, RL.Resistant), R(DT.Water, RL.Resistant)],
      actions: [
        act({ actionName: '군주의 시선', type: AT.AttackDebuff, selectionWeight: 1.0, damageIncrease: f(0.15), statusDurationTurns: 3 }),
        act({ actionName: '군주의 주먹', type: AT.Attack, selectionWeight: 1.0, damageType: DT.Blunt, damageMultiplier: 1.0 }),
        act({ actionName: '군주의 지탄', type: AT.Attack, selectionWeight: 1.0, damageType: DT.Pierce, damageMultiplier: 1.0 }),
        act({ actionName: '군주의 폭정', type: AT.Attack, selectionWeight: 0.25, damageType: DT.Almighty, damageMultiplier: 2.0 }),
        act({ actionName: '군주의 방패', type: AT.Defend, selectionWeight: 1.0, damageReduction: f(0.3) }),
      ],
    };
  }
  const ENEMY_PORTRAIT = { '해골 기사': 'skeleton_knight', '해골 방패병': 'skeleton_shieldbearer', '해골 마법사': 'skeleton_mage', '해골 군주': 'skeleton_lord' };

  // Combatant used for an enemy (BattleScreenController.CreateEnemy)
  function createEnemyCombatant(def) {
    const c = new Combatant();
    c.name = def.enemyName; c.maxHp = def.maxHp; c.currentHp = def.maxHp; c.maxSp = 0; c.currentSp = 0;
    c.attack = def.attack; c.defense = def.defense;
    const res = new Equipment('Enemy Resistances', false);
    res.resist = def.resistances.map((r) => ({ type: r.type, level: r.level }));
    c.armor = [res];
    const w = new Equipment('', true); w.weaponDamageType = DT.Slash; c.weapon = w;
    return c;
  }

  // Weighted random action (ChooseAction)
  function chooseAction(actions) {
    if (!actions || actions.length === 0) return null;
    let total = 0;
    for (const a of actions) total += Math.max(0, a.selectionWeight);
    let r = randFloat(0, total);
    for (const a of actions) {
      r -= Math.max(0, a.selectionWeight);
      if (r <= 0) return a;
    }
    return actions[actions.length - 1];
  }

  // ---- text helpers ---------------------------------------------------------------------
  const fmt2 = (n) => String(Math.round(n * 100) / 100);          // {0:0.##}
  const fmtPct = (n) => Math.round(n * 100 + 1e-9) + '%';         // {0:P0}
  function intentText(view) {
    const a = view.plannedAction;
    if (!a) return '행동 예고 없음';
    let s;
    switch (a.type) {
      case AT.Attack:
        s = damageTypeName(a.damageType) + ' ' + fmt2(a.damageMultiplier) + '배';
        if (view.pendingDamageIncrease > 0) s += ' · 피해 +' + fmtPct(view.pendingDamageIncrease);
        break;
      case AT.Defend:
        s = a.flatDamageReduction > 0 ? '받는 피해 ' + a.flatDamageReduction + ' 감소' : '받는 피해 ' + Math.trunc(f(a.damageReduction * 100)) + '% 감소';
        break;
      case AT.Buff: s = '다음 공격 피해 +' + fmtPct(a.damageIncrease); break;
      case AT.Debuff: s = '받는 피해 +' + fmtPct(a.damageIncrease) + ' · ' + a.statusDurationTurns + '턴'; break;
      case AT.AttackDebuff: s = '공격력 -' + fmtPct(a.damageIncrease) + ' · ' + a.statusDurationTurns + '턴'; break;
      default: s = '행동하지 않음';
    }
    return a.actionName + ' (' + s + ')';
  }

  // Rest site (RestSiteService)
  function recoverHp(c) { const v = Math.ceil(c.totalMaxHp * 0.2); const before = c.currentHp; c.currentHp = clamp(c.currentHp + v, 0, c.totalMaxHp); return c.currentHp - before; }
  function recoverSp(c) { const v = Math.ceil(c.totalMaxSp * 0.5); const before = c.currentSp; c.currentSp = clamp(c.currentSp + v, 0, c.totalMaxSp); return c.currentSp - before; }

  global.JRPG = Object.assign(global.JRPG || {}, {
    f, DT, RL, AT, RT, BI, DAMAGE_NAMES, damageTypeName, resistanceName, AVAILABLE_ELEMENTS,
    setRng, randInt, randFloat, clamp,
    Equipment, Combatant, setResistance, calculate,
    createLongsword, createRapier, createMace, createMeatSlicer, createHeartPiercing, createSkullBreaker, createClothArmor,
    createSkeletonKnight, createSkeletonShieldBearer, createSkeletonMage, createSkeletonLord, ENEMY_PORTRAIT,
    createEnemyCombatant, chooseAction, intentText, fmt2, fmtPct, recoverHp, recoverSp,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = global.JRPG;
})(typeof window !== 'undefined' ? window : globalThis);
