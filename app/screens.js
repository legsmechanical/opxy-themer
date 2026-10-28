// What the user sees: screen names by engine/page, what the OS paints at runtime, and what each palette
// swatch drives. From the workspace's static firmware map (palette_semantics.md) and device tests; anything
// not seen on a device is marked "static".

// Engine screens were matched to the device by photos (workspace memory opxy-engine-screens); other screens
// keep their file name, since TE's names can mislead and we haven't checked them all on a device.
const ENGINES = {
  'fmstrings2.svg': 'Axis', 'dissolve.svg': 'Dissolve', 'drum2.svg': 'Drum', 'dbox.svg': 'Drumline',
  'ep.svg': 'EPiano', 'hardsync.svg': 'Hardsync', 'external_midi.svg': 'MIDI', 'organ.svg': 'Organ',
  'prism.svg': 'Prism', 'sampler.svg': 'Sampler', 'slinky.svg': 'Simple', 'wavetable.svg': 'Wavetable',
  'adsr.svg': 'Envelope', 'mixer.svg': 'Mixer', 'sample_slicer.svg': 'Slicer', 'generic_fx2.svg': 'Reverb / chorus',
};
export const GROUPS = [
  ['Instruments', ['fmstrings2', 'dissolve', 'drum2', 'dbox', 'dbox_t2', 'ep', 'hardsync', 'external_midi', 'organ',
    'prism', 'sampler', 'slinky', 'wavetable', 'generic_synth', 'fmstrings']],
  ['Sound', ['adsr', 'filter', 'dynaenv', 'singlelfo', 'duallfo', 'auxlfo', 'rndlfo', 'reroutelfo', 'sidechainlfo',
    'lfo_popup', 'playmode', 'octave', 'pitchbend', 'hold']],
  ['Effects & mix', ['mixer', 'master', 'master_dist', 'eq', 'fx_send', 'fx_filter', 'delay', 'reverb', 'generic_fx',
    'generic_fx2', 'magic', 'tape', 'aux_track']],
  ['Sequencer', ['pattern', 'songmode', 'arpeggio', 'chord', 'tempo', 'clock', 'step_popup', 'seq_popup', 'punch_popup',
    'tbuttons', 'project']],
  ['Samples', ['sample_editor', 'sample_slicer', 'in', 'monitor']],
].map(([g, names]) => [g, names.map(n => `${n}.svg`)]);

export const label = name => ENGINES[name] || name.replace(/\.svg$/, '').replace(/_/g, ' ');
export const groupOf = name => (GROUPS.find(([, names]) => names.includes(name)) || ['System'])[0];

/** Parts of a screen the OS draws itself from the palette swatches (not in the SVG, so not in the preview). */
export const RUNTIME = {
  'fmstrings2.svg': 'The cubes and their dots are copied into place by the OS, so the preview shows only the bar.',
  'mixer.svg': 'Track columns and meters use the grey ramp (column 1 black, then grey2…grey8).',
  'pattern.svg': 'Track strips and steps use the grey ramp; the playhead fades grey8 → grey1.',
  'dissolve.svg': 'The pixel grid is drawn from grey2…grey8.',
  'hardsync.svg': 'The beam is drawn from grey1…grey7.',
  'prism.svg': 'Rays are drawn in grey7 and their tails snap to the nearest palette colour.',
  'adsr.svg': 'The envelope rests in grey5 and flashes grey8 while you turn a knob; fills grey2, grid grey2.',
  'dynaenv.svg': 'The envelope is drawn in grey8 / grey5.',
  'sampler.svg': 'The waveform is grey8; centre lines grey4.',
  'drum2.svg': 'The waveform is grey8; pads grey3 / grey4 / grey6.',
  'sample_slicer.svg': 'The waveform is grey8, unselected slices grey4, clipping red.',
  'sample_editor.svg': 'The waveform is drawn from the palette; clipping red.',
  'wavetable.svg': 'The wave curve is grey8.',
  'master.svg': 'The clip light is red, otherwise grey3.',
  'power_popup.svg': 'Battery segments are red or grey3.',
  'project.svg': 'Recording state is red.',
  ...Object.fromEntries(['singlelfo', 'duallfo', 'auxlfo', 'rndlfo', 'reroutelfo', 'sidechainlfo'].map(n =>
    [`${n}.svg`, 'Knob labels fade grey3 → grey8 while turned; the curve is grey5 / grey8.'])),
};

/** What each xy_palette.svg swatch drives at runtime: a static read of the firmware; the mixer, envelope and
 * knob labels were confirmed on a device (2026-10-24). */
export const SWATCH_ROLES = {
  grey1: 'Backgrounds, inactive items, waveform background',
  grey2: 'Envelope fills and grid, off labels; mixer column 2',
  grey3: 'Resting knob labels, idle list rows, clip light off',
  grey4: 'Waveform centre lines, unselected slices, outlines',
  grey5: 'Envelope and LFO curves at rest, dimmed items',
  grey6: 'Secondary text, selected list rows',
  grey7: 'Rules and grid lines, prism rays',
  grey8: 'Main foreground: values, waveforms, active knob labels, envelope highlight',
  red: 'Record, clipping, low battery',
  black: 'Not read at runtime (no effect)',
  white: 'Not read at runtime (no effect)',
  blue: 'Not read at runtime (no effect)',
};

