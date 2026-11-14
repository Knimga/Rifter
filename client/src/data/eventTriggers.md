# Event triggers

A **trigger** makes a unit react to events while a buff or debuff lasts. Examples are striking back when parried, poisoning on a hit, or rewarding a healer. The same rules apply to party members, summons and enemies.

The types are in [`combat/abilities.ts`](combat/abilities.ts) (`Trigger`, `TriggerEffect`). Triggers are resolved in [`combat/abilityExecution.ts`](combat/abilityExecution.ts) (`executeAction`).

## Where a trigger goes

A trigger lives on a `buff` or `debuff` effect of an ability, in its `trigger` field. The buff's `turns` is how long the trigger lasts (its bearer's turns). `stats` / `statsPercent` are optional, so a buff can be only a trigger.

- **On a buff,** the trigger goes on the unit the buff lands on: an ally, or the caster with `target: 'self'`.
- **On a debuff,** it goes on an enemy, only if the attack hits. The enemy then reacts as the *bearer*, for example punishing itself whenever it attacks.

The unit carrying the trigger is its **bearer**.

### Passive effects: always on

A creature (enemy, boss or summon) or a player class has `passiveEffects` (`CreatureClassData` in [`units/enemies.ts`](units/enemies.ts), `ClassData` in [`units/classes.ts`](units/classes.ts)): a list of `PassiveEffect`, each a `name`, an optional `damageElement` (the color it shows in) and exactly one of a `trigger` (a `Trigger`, below) or an `aura` (an `Aura`, as on an ability's `aura` effect):

```ts
passiveEffects: [
  { name: 'Chitin Spines', damageElement: 'physical', trigger: {
    when: 'attacked', categories: ['melee'],
    effects: [{ type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 3, maxDamage: 3 }],
  } },
  { name: 'Acrid Stench', damageElement: 'poison', aura: {
    area: 'blast1',
    effects: [{ type: 'debuff', appliesTo: 'enemies', stats: { meleeHit: -5 } }],
  } },
],
```

- **Behavior only:** a passive effect is what `passives` can't express. Stat bonuses go in `passives` (and a creature's `resistances`), and regeneration goes in the `hpRegen` / `mpRegen` stats. There is one way to write each.

- **Always on:** it never runs out, can't be removed (a dispel leaves it) and never shows as a status marker. A trigger's name floats over the bearer when it fires, like a buff's.
- **Its own:** the bearer put it on itself. A trigger's effects on `'source'` land on the bearer.
- **Same rules otherwise:** chance, events, recipients, no chains and threat all work as for a trigger buff, and the same load warnings apply.
- **How it's kept:** a unit starts with its passive effects in its buffs (`passiveEffectEntries` in [`units/stats.ts`](units/stats.ts)), as the same entries a cast trigger buff or aura makes, but permanent (`turnsLeft` Infinity, like gear's bonuses; `isPassiveEntry` tells them from cast effects), so triggers and auras need no extra rules.
- **Party members:** a member's passive effects are decided in one place, `memberPassiveEffects` in [`units/party.ts`](units/party.ts) (its class's, then its subclass's once picked). Their entries are stored in its `MemberState` like a creature's. When a member dies or the party leaves a location, what was cast on it ends (`withoutCastEffects`) but its passive entries stay.
- **Shown:** a class's passive effects are listed with its passives on the character select screen and the party window's Abilities tab, in words. A creature's are not shown.

**Triggers never stack.** A buff or debuff with a trigger counts as `maxStacks: 1`, stats included: casting it again on the same unit, by anyone, replaces the one already there. The new one starts its full `turns` again, and its `source` is the newest caster. Setting `maxStacks` above 1 on it is warned about at load. (Without a trigger, a buff or debuff stacks without limit unless it sets `maxStacks`. At the cap, the oldest stack is replaced.)

## `Trigger` fields

| Field | Type | Default | What it does |
|---|---|---|---|
| `when` | `'attacking'` \| `'attacked'` \| `'healing'` \| `'healed'` | *required* | The event, from the bearer's side (see below). |
| `on` | outcome or list of outcomes | `'hit'` | **Attack events only.** Which outcomes of the hit roll count: `'hit'`, `'miss'`, `'dodge'`, `'parry'`, `'block'`, or `'stopped'` (any of the four non-hits). |
| `categories` | `('melee' \| 'ranged' \| 'magic')[]` | any | **Attack events only.** Only attacks of these categories count. |
| `weaponOnly` | `boolean` | `false` | **Attack events only.** Only attacks with a physical weapon count: an ability with `useWeapon` (for a party member, their weapon attack too). A creature counts only for its own `useWeapon` abilities, so one without any never sets off a `weaponOnly` trigger. |
| `chance` | `number` (%) | `100` | Rolled each time the event happens. |
| `effects` | `TriggerEffect[]` | *required* | What happens when it fires (see below). |

### Events (`when`)

| `when` | Fires on | The *other* unit is |
|---|---|---|
| `'attacking'` | each hit roll the bearer makes against a unit | the unit attacked |
| `'attacked'` | each hit roll made against the bearer | the attacker |
| `'healing'` | each `heal` effect the bearer lands on a unit | the unit healed |
| `'healed'` | each `heal` effect landing on the bearer | the healer |

**What counts as an event:**
- **Attacks:** an attack event comes from an `enemy`-target ability. An area attack makes one event per unit it rolls against.
- **Self-heals:** a self-heal is both a `'healing'` and a `'healed'` event.
- **Not events:** HoT and DoT ticks, which happen at the start of their bearer's turn.

## Effects (`TriggerEffect`)

A trigger's effect can be any ability `Effect` (`damage`, `dot`, `heal`, `hot`, `buff`, `debuff`, `root`, `threat`, `summon`, `dispel`: on the other unit it takes buffs and HoTs if that unit attacked or was attacked, else debuffs and DoTs; on the bearer, debuffs and DoTs). It can also be:

```ts
{ type: 'weaponAttack', appliesTo: 'target' }
```

This makes the bearer attack the other unit once with its basic attack: a party member's held weapon, or a creature's cheapest no-MP enemy-target ability. It costs no AP or MP and rolls to hit normally. It happens only if the other unit is in that attack's range and in sight.

### Who gets each effect (`appliesTo`)

Inside a trigger, `appliesTo` is read from the bearer's side:

| `appliesTo` | Recipient |
|---|---|
| `'target'` | the other unit of the event (attacker, unit attacked, healer, or unit healed) |
| `'caster'` | the bearer itself |
| `'source'` | whoever put the buff or debuff on the bearer. Skipped if that unit is gone. Only valid in triggers. |
| `'allies'` | not supported in triggers (a warning at load) |

### How effects land

- **No hit roll:** every effect except `weaponAttack` lands directly. A debuff or root on the other unit always sticks.
- **Damage and DoTs** use their data amounts at the bearer's level (`levelScale`, [`combat/abilities.ts`](combat/abilities.ts)), with no % bonus. They are reduced by the recipient's armor/MR and element resistance, with no crit.
- **Heals** are flat: exactly the amount on the data at the bearer's level, not even the recipient's `healingReceived` % applies. (A HoT a trigger applies still gets the recipient's `healingReceived` per tick, like any HoT.) A `heal` with `restoresMP: true` restores MP instead of HP; so does a `hot` with it (each tick restores MP, added to the bearer's MP regen at the start of its turn).
- **Never scaled.** No bonus of the bearer or of whoever cast the trigger is added to what a trigger does, whether the bearer cast it on itself or an ally did: no damage bonus, penetration or healing stat, on damage, DoTs, heals or HoTs. A triggered effect does exactly what its ability data reads at the bearer's level (a `weaponAttack` is the exception: it is a normal attack with the bearer's own stats).
- **The bearer must still be alive** after the damage it has taken in this action so far. A defender killed by the hit doesn't strike back.
- **Threat:** what a party member's or summon's trigger does builds that unit's own threat.
- **No chains:** a trigger's effects never set off other triggers. The one exception is a triggered `weaponAttack`, whose hit roll is a normal attack event: it can set off thorns or a poison proc, but never another `weaponAttack`.
- **Display:** each time a trigger fires, the buff's name floats over the bearer (e.g. "Riposte!"). Ability cards and status tooltips describe the trigger in words.

## Examples

### 1. Riposte: a counterattack on a parry
A self-buff: +10 parry, and every parried attack is answered with a weapon attack.

```ts
{
  name: 'Riposte',
  mpCost: 5,
  apCost: 1,
  range: 0,
  target: 'self',
  effects: [
    {
      type: 'buff',
      appliesTo: 'target',
      stats: { parry: 10 },
      turns: 3,
      trigger: {
        when: 'attacked',
        on: 'parry',
        effects: [
          { type: 'weaponAttack', appliesTo: 'target' },
        ],
      },
    },
  ],
}
```

### 2. Envenom: a chance to poison on melee hits
A self-buff: each melee hit has a 30% chance to poison the target for 5 damage a turn, for 3 turns.

```ts
{
  name: 'Envenom',
  mpCost: 8,
  apCost: 1,
  range: 0,
  target: 'self',
  displayElement: 'poison',
  effects: [
    {
      type: 'buff',
      appliesTo: 'target',
      turns: 4,
      trigger: {
        when: 'attacking',
        categories: ['melee'],
        chance: 30,
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerTurn: 5, turns: 3 },
        ],
      },
    },
  ],
}
```

### 3. Shared Light: a heal-event buff that rewards its caster
Cast on an ally. Whenever that ally is healed by anyone, the one healed gets +5 armor for 2 turns, and the caster of Shared Light regains 3 MP.

```ts
{
  name: 'Shared Light',
  mpCost: 6,
  apCost: 1,
  range: 4,
  target: 'ally',
  displayElement: 'holy',
  effects: [
    {
      type: 'buff',
      appliesTo: 'target',
      turns: 4,
      trigger: {
        when: 'healed',
        effects: [
          { type: 'buff', appliesTo: 'caster', stats: { armor: 5 }, turns: 2 },
          { type: 'heal', appliesTo: 'source', damageElement: 'holy', minHeal: 3, maxHeal: 3, restoresMP: true },
        ],
      },
    },
  ],
}
```
