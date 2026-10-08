export interface Period {
  building: string;
  room: string;
  color: string;
  roomId?: string;
  mapRevision?: string;
}

export interface ScheduleTemplate {
  name: string;
  periods: Period[];
}
