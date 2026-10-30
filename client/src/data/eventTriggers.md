# Event triggers

A **trigger** makes a unit react to events while a buff or debuff lasts. Examples are striking back when parried, poisoning on a hit, or rewarding a healer. The same rules apply to party members, summons and enemies.

The types are in [`combat/abilities.ts`](combat/abilities.ts) (`Trigger`, `TriggerEffect`). Triggers are resolved in [`combat/abilityExecution.ts`](combat/abilityExecution.ts) (`executeAction`).

## Where a trigger goes

A trigger lives on a `buff` or `debuff` effect of an ability, in its `trigger` field. The buff's `rounds` is how long the trigger lasts. `stats` / `statsPercent` are optional, so a buff can be only a trigger.

- **On a buff,** the trigger goes on the unit the buff lands on: an ally, or the caster with `target: 'self'`.
- **On a debuff,** it goes on an enemy, only if the attack hits. The enemy then reacts as the *bearer*, for example punishing itself whenever it attacks.

The unit carrying the trigger is its **bearer**.

### Passive triggers: always on

A class or a creature (enemy, boss or summon) can also have triggers it always has, with no ability to cast them: `passiveTriggers` on its entry (`ClassData` in [`units/classes.ts`](units/classes.ts), `CreatureClassData` in [`units/enemies.ts`](units/enemies.ts)). Each is a `PassiveTrigger`: a `name`, an optional `damageElement`, and the `trigger` itself.

```ts
passiveTriggers: [
  { name: 'Chitin Spines', damageElement: 'physical', trigger: {
    when: 'attacked', categories: ['melee'],
    effects: [{ type: 'damage', appliesTo: 'target', damageElement: 'physical', minDamage: 3, maxDamage: 3 }],
  } },
],
```

- **Always on:** it never runs out, can't be removed, and never shows as a status marker. Its name floats over the bearer when it fires, like a buff's.
- **Its own:** the bearer put it on itself. Its effects on `'source'` land on the bearer, and its own bonuses count, as on a self-cast trigger buff.
- **Same rules otherwise:** chance, events, recipients, no chains and threat all work as for a trigger buff, and the same load warnings apply.
- **Shown:** a class's passive triggers are listed with its passives on the character select screen, in words.

**Triggers never stack.** A buff or debuff with a trigger counts as `maxStacks: 1`, stats included: casting it again on the same unit, by anyone, replaces the one already there. The new one starts its full `rounds` again, and its `source` is the newest caster. Setting `maxStacks` above 1 on it is warned about at load. (Without a trigger, a buff or debuff stacks without limit unless it sets `maxStacks`. At the cap, the oldest stack is replaced.)

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
- **Not events:** HoT and DoT ticks, which happen at the top of the round.

## Effects (`TriggerEffect`)

A trigger's effect can be any ability `Effect` (`damage`, `dot`, `heal`, `hot`, `buff`, `debuff`, `root`, `threat`, `summon`). It can also be:

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
- **Damage and DoTs** use flat numbers. They are reduced by the recipient's armor/MR and element resistance, with no crit.
- **Heals** are flat, plus the recipient's `healingReceived`. A `heal` with `restoresMP: true` restores MP instead of HP.
- **Self-cast buffs scale.** When the bearer cast the buff on itself (a Rogue's poison proc), its own bonuses count, the same way as for its abilities:
  - **Damage:** gets its damage bonus and penetration for that element. Physical damage counts as the category of the attack that set it off: melee, ranged, or magic for heal events.
  - **DoTs:** get half the bonus per round.
  - **Heals:** get its healing stat (a HoT gets half).
  - **Still no crit.** A buff someone else put on the bearer, and any debuff, stays flat.
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
      rounds: 3,
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
A self-buff: each melee hit has a 30% chance to poison the target for 5 damage a round, for 3 rounds.

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
      rounds: 4,
      trigger: {
        when: 'attacking',
        categories: ['melee'],
        chance: 30,
        effects: [
          { type: 'dot', appliesTo: 'target', damageElement: 'poison', damagePerRound: 5, rounds: 3 },
        ],
      },
    },
  ],
}
```

### 3. Shared Light: a heal-event buff that rewards its caster
Cast on an ally. Whenever that ally is healed by anyone, the one healed gets +5 armor for 2 rounds, and the caster of Shared Light regains 3 MP.

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
      rounds: 4,
      trigger: {
        when: 'healed',
        effects: [
          { type: 'buff', appliesTo: 'caster', stats: { armor: 5 }, rounds: 2 },
          { type: 'heal', appliesTo: 'source', damageElement: 'holy', minHeal: 3, maxHeal: 3, restoresMP: true },
        ],
      },
    },
  ],
}
```
