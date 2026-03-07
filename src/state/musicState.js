export const musicState = {

  activeNote: -1,
  targetNote: -1,

  noteHue: 0,
  targetHue: 0,

  pointerDown: false

};

export function setActiveNote(note){

  if(note === musicState.activeNote) return;

  musicState.activeNote = note;
  musicState.targetHue = note / 12;

}

export function updateMusicState(){

  const s = musicState;

  s.noteHue += (s.targetHue - s.noteHue) * 0.08;

}