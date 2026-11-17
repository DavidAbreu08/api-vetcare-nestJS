import { Actor } from "../core/authorization";
import { ReservationEntity } from "./entities/reservation.entity";
import { serializeReservation, serializeReservations } from "./reservation.serializer";

const account = (id: string, name: string) => ({
  id, name, email: `${id}@x.pt`, phone: "912345678", birthDate: "1990-01-01", nif: "123456789",
  profilePictureUrl: `https://img/${id}.png`, isActive: true, description: "d", notes: "private notes",
  passwordHash: "$2b$10$hash", createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null,
});
const actor = (flags: Partial<Actor>): Actor => ({ id: "x", roleIds: [], isAdmin: false, isEmployee: false, isClient: false, employeeId: null, ...flags });
const reservation = () => ({
  id: "R-1", status: "confirmed", notificationStatus: "sent",
  client: account("client", "Cliente"), employee: { id: "E-1", userId: "vet", user: account("vet", "Vet") },
  animal: { id: "A-1", name: "Rex", owner: account("client", "Cliente") },
}) as unknown as ReservationEntity;

describe("Reservation projection", () => {
  it("shows a client only the employee's id, name and picture, and no repeated owner", () => {
    const view: any = serializeReservation(reservation(), actor({ id: "client", isClient: true }));
    expect(view.employee).toEqual({ id: "E-1", name: "Vet", profilePictureUrl: "https://img/vet.png" });
    expect(view.client).toEqual({ id: "client", name: "Cliente", email: "client@x.pt", phone: "912345678" });
    expect(view.animal).toEqual({ id: "A-1", name: "Rex" });
    expect(view).toMatchObject({ id: "R-1", status: "confirmed", notificationStatus: "sent" });
  });

  it("shows staff (non-admin) only the client's contact data and the reduced employee", () => {
    const [view]: any[] = serializeReservations([reservation()], actor({ id: "vet", isEmployee: true }));
    expect(view.client).toEqual({ id: "client", name: "Cliente", email: "client@x.pt", phone: "912345678" });
    expect(view.employee).toEqual({ id: "E-1", name: "Vet", profilePictureUrl: "https://img/vet.png" });
    expect(JSON.stringify(view)).not.toMatch(/nif|birthDate|private notes|passwordHash/);
  });

  it("shows administrators full accounts without password hashes", () => {
    const view: any = serializeReservation(reservation(), actor({ isAdmin: true }));
    expect(view.employee).toMatchObject({ id: "E-1", userId: "vet", name: "Vet" });
    for (const user of [view.client, view.employee.user, view.animal.owner]) {
      expect(user).toMatchObject({ nif: "123456789", birthDate: "1990-01-01", notes: "private notes" });
      expect(user).not.toHaveProperty("passwordHash");
    }
  });

  it("keeps absent relations absent", () => {
    const { client: _client, ...withoutClient } = reservation() as any;
    const view: any = serializeReservation({ ...withoutClient, employee: null } as ReservationEntity, actor({ isClient: true }));
    expect(view).not.toHaveProperty("client");
    expect(view.employee).toBeNull();
  });

  describe("authorship (createdBy)", () => {
    const authored = (createdBy: string | null) => ({ ...(reservation() as any), createdBy, creator: account("vet", "Vet") }) as ReservationEntity;

    it("shows administrators the author id", () => {
      expect(serializeReservation(authored("vet"), actor({ id: "adm", isAdmin: true }))).toMatchObject({ createdBy: "vet", createdBySelf: false });
    });

    it("hides the employee author from the client but tells them it was not themselves; the creator account never leaks", () => {
      const view: any = serializeReservation(authored("vet"), actor({ id: "client", isClient: true }));
      expect(view).toMatchObject({ createdBy: null, createdBySelf: false });
      expect(view).not.toHaveProperty("creator");
      const staff: any = serializeReservation(authored("other-staff"), actor({ id: "vet", isEmployee: true }));
      expect(staff).toMatchObject({ createdBy: null, createdBySelf: false });
      expect(staff).not.toHaveProperty("creator");
    });

    it("shows a client author their own id (case-insensitive) and createdBySelf=true", () => {
      expect(serializeReservation(authored("CLIENT"), actor({ id: "client", isClient: true }))).toMatchObject({ createdBy: "CLIENT", createdBySelf: true });
    });

    it("reports an unknown author (NULL) as null for everyone", () => {
      for (const viewer of [actor({ isAdmin: true }), actor({ id: "client", isClient: true })]) {
        expect(serializeReservation(authored(null), viewer)).toMatchObject({ createdBy: null, createdBySelf: false });
      }
    });

    it("gives administrators the creator only as a full account without password hash", () => {
      const view: any = serializeReservation(authored("vet"), actor({ isAdmin: true }));
      expect(view.creator).toMatchObject({ id: "vet", nif: "123456789" });
      expect(view.creator).not.toHaveProperty("passwordHash");
    });
  });
});

describe("Reservation service projection", () => {
  const service = { id: "S-1", code: "CONSULTATION", name: "Consultation", description: "internal", durationMinutes: 30, isActive: false, createdAt: new Date(0), updatedAt: new Date(0) };

  it("gives every caller the same { id, code, name, durationMinutes } summary, and null for legacy reservations", () => {
    const booked = { ...(reservation() as any), serviceId: "S-1", service } as ReservationEntity;
    for (const viewer of [actor({ isAdmin: true }), actor({ id: "client", isClient: true })]) {
      const view: any = serializeReservation(booked, viewer);
      expect(view.serviceId).toBe("S-1");
      expect(view.service).toEqual({ id: "S-1", code: "CONSULTATION", name: "Consultation", durationMinutes: 30 });
    }
    expect(serializeReservation({ ...(reservation() as any), serviceId: null, service: null }, actor({ isAdmin: true }))).toMatchObject({ serviceId: null, service: null });
    // Always present: null when there is no service, even if the relation was not loaded.
    expect(serializeReservation({ ...(reservation() as any), serviceId: null }, actor({ isAdmin: true }))).toHaveProperty("service", null);
    expect(serializeReservation(reservation(), actor({ isAdmin: true }))).toHaveProperty("service", null);
  });

  it("fails loudly instead of silently omitting the service when the relation was not loaded", () => {
    const unloaded = { ...(reservation() as any), serviceId: "S-1" } as ReservationEntity;
    expect(() => serializeReservation(unloaded, actor({ isAdmin: true }))).toThrow("service relation not loaded");
  });
});
