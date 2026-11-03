// Every sampled sound: its source recording, the seconds to keep (one [start, end] per take) and how loud to make it.
// level is the loudest 100 ms of the take in dB RMS, so short and long sounds can be balanced against each other.
// The recordings are from the Sonniss GameAudioGDC bundles and their license bars supplying them as sound effects,
// so neither they nor the processed files go in this repository. See "Sound" in the README.
export const SFX = {
  step: { from: 'GDC 2016, Levan Nadashvili - Soldier Footsteps', file: 'fs-concrete-soldier-crouch-n05-c11ab8.wav', takes: [[0, 0.48]], level: -28 },
  turn: { from: 'GDC 2017, Double Trouble Audio - Medieval Armor and Impacts', file: 'leatherarmor-rustle-03-cb811e.wav', takes: [[0, 0.74]], level: -36 },
  bump: { from: 'GDC 2019, Red Libraries - Bodyfall', file: 'rl-bodyfall-concrete-generic-feet-mid-mono-med-impact-02-470e8c.wav', takes: [[0, 0.74]], level: -18 },
  hit: { from: 'GDC 2017, Double Trouble Audio - Medieval Armor and Impacts', file: 'weapon-impact-parry-01-b55893.wav', takes: [[0, 0.92]], level: -13 },
  miss: { from: 'GDC 2020, David Dumais Audio - Weapon Sounds - Weapon Swings', file: 'meleeswingspack-96khz-stereo-highswings15-68c7a7.wav', takes: [[0, 0.43]], level: -20 },
  kill: { from: 'GDC 2017, MatiasMacSD - CREATURES ZONE', file: 'creature-monster-pain-01-82bace.wav', takes: [[0, 0.83]], level: -13 },
  down: { from: 'GDC 2016, SoundBits - Screams & Shouts 2 - Humans', file: 'male-shout-of-pain-132-1144e5.wav', takes: [[0, 0.95]], level: -13 },
  door: { from: 'GDC 2019, PMSFX - HAUNTED DOORS', file: 'pm-hd-designed-01-doors-old-wooden-scary-horror-open-creeking-ff74a0.wav', takes: [[0, 2.3]], level: -16 },
  click: { from: 'GDC 2020, Bluezone - Switch And Button Sound Effects', file: 'bluezone-bc0268-switch-button-click-small-005-36fbda.wav', takes: [[0, 0.25]], level: -24 },
  spell: { from: 'GDC 2020, David Dumais Audio - Spells Magic 1', file: 'magic-spells-castlong-combo-dark02-247b0d.wav', takes: [[0, 5.02]], level: -18 },
  heal: { from: 'GDC 2018, Sounds Visual - 50 Flat Design Sound Effects', file: '33-fx3184-ascending-harp-glissando-f338fc.wav', takes: [[0, 2.66]], level: -18 },
  rage: { from: 'GDC 2020, Phase 4 Libraries - Monster Roars', file: 'mr-orc-attack-vo-04-cd80c6.wav', takes: [[0, 0.53]], level: -13 },
  level: { from: 'GDC 2018, Sounds Visual - 50 Flat Design Sound Effects', file: '33-fx3184-ascending-harp-glissando-f338fc.wav', takes: [[0, 2.66]], level: -14 },
  // Four separate grabs in one recording, played in varying order.
  pickup: { from: 'GDC 2019, Borg Sound - Bag Foley', file: 'bag-foley-wallet-leather-grab-68cccf.wav', takes: [[0.16, 0.33], [2.17, 2.38], [4.37, 4.55], [6.12, 6.53]], level: -24 },
  drop: { from: 'GDC 2020, Sounds Great - Metal Elements', file: 'pipe-drop-2-746593.wav', takes: [[0, 0.69]], level: -22 },
  equip: { from: 'GDC 2017, Double Trouble Audio - Medieval Armor and Impacts', file: 'chainmail-impact-hard-03-889af9.wav', takes: [[0, 0.64]], level: -22 },
  fall: { from: 'GDC 2019, Articulated Sounds - Magic Elements vol.1', file: 'ground-impact-large-falling-rocks-various-04-c85d5f.wav', takes: [[0, 3.31]], level: -16 },
  // The first three steps of a 30 second walking loop.
  stairs: { from: 'GDC 2018, The Sound Pack Tree - Footstep Loops', file: '1879-footsteps-wooden-stairs-down-80-fpm-loop-e8bb9a.wav', takes: [[0.17, 2.05]], level: -26 },
  throw: { from: 'GDC 2016, SoundBits - Just Whoosh 3', file: 'swoosh-rope-whip-075-f99585.wav', takes: [[0, 0.36]], level: -22 },
};
