import { Injectable } from "@nestjs/common";

@Injectable()
export class TimeUtilsService {
  private readonly BUSINESS_HOURS = {
    start: "07:00",
    end: "20:00",
    days: [1, 2, 3, 4, 5],
  };

  public getBusinessHours(): { start: string; end: string } {
    return {
      start: this.BUSINESS_HOURS.start,
      end: this.BUSINESS_HOURS.end,
    };
  }

  public generateTimeSlots(
    startTime: string,
    endTime: string,
    durationMinutes: number
  ): string[] {
    const slots: string[] = [];
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    let currentHour = startHour;
    let currentMinute = startMinute;

    while (
      currentHour < endHour ||
      (currentHour === endHour && currentMinute < endMinute)
    ) {
      const timeStr = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;
      slots.push(timeStr);

      // Increment time
      currentMinute += durationMinutes;
      if (currentMinute >= 60) {
        currentHour += Math.floor(currentMinute / 60);
        currentMinute = currentMinute % 60;
      }
    }

    return slots;
  }

  public compareTimes(timeA: string, timeB: string): number {
    const [hoursA, minutesA] = timeA.split(":").map(Number);
    const [hoursB, minutesB] = timeB.split(":").map(Number);

    if (hoursA !== hoursB) return hoursA - hoursB;
    return minutesA - minutesB;
  }

  public combineDateAndTime(date: Date, timeString: string): Date {
    const [hours, minutes] = timeString.split(":").map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  }

  public isWithinBusinessHours(
    timeStart: string,
    timeEnd: string,
    date: Date | string
  ): boolean {
    const dateObj = typeof date === 'string' ? new Date(date) : date;

      // Validate the Date object
    if (isNaN(dateObj.getTime())) {
      throw new Error('Invalid date provided');
    }
    // Check day of week
    const dayOfWeek = dateObj.getDay();
    if (!this.BUSINESS_HOURS.days.includes(dayOfWeek)) return false;

    // Check time range
    return (
      this.compareTimes(timeStart, this.BUSINESS_HOURS.start) >= 0 &&
      this.compareTimes(timeEnd, this.BUSINESS_HOURS.end) <= 0
    );
  }

  public calculateDuration(timeStart: string, timeEnd: string): number {
    const [startH, startM] = timeStart.split(":").map(Number);
    const [endH, endM] = timeEnd.split(":").map(Number);
    return endH * 60 + endM - (startH * 60 + startM);
  }

  public plusMinutes(time: string, minutes: number): string {
    const [hours, mins] = time.split(":").map(Number);
    const totalMinutes = hours * 60 + mins + minutes;

    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMins = totalMinutes % 60;

    return `${String(newHours).padStart(2, "0")}:${String(newMins).padStart(2, "0")}`;
  }

  public minusMinutes(time: string, minutes: number): string {
    return this.plusMinutes(time, -minutes);
  }

  public timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }
}
