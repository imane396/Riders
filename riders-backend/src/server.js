require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { getCalendarClient, getBarberCalendars } = require("./googleCalendar");
const { getAvailableSlots } = require("./availability");
const { initDb } = require("./db");
const { validateBookingInput } = require("./bookingValidation");
const { bookSlotOnGoogleCalendar } = require("./booking");

initDb();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    const calendar = await getCalendarClient();
    const list = await calendar.calendarList.list();
    const accessible = (list.data.items || []).map((c) => ({
      id: c.id,
      summary: c.summary,
      accessRole: c.accessRole,
    }));

    const barberCalendars = getBarberCalendars();
    const configuredBarbers = Object.keys(barberCalendars);

    res.json({
      status: "ok",
      googleAuth: "connected",
      configuredBarbers,
      accessibleCalendars: accessible,
      warning:
        configuredBarbers.length === 0
          ? "Aucun agenda coiffeur configuré. Lancez : node scripts/setup-calendars.js votre-email@gmail.com \"Coiffeur 1\" \"Coiffeur 2\" ..."
          : null,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      googleAuth: "failed",
      message: err.message,
    });
  }
});

app.get("/api/availability", async (req, res) => {
  try {
    const { date, barber, service } = req.query;
    const barberCalendars = getBarberCalendars();

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: "Paramètre date invalide. Format attendu : YYYY-MM-DD",
      });
    }

    if (!barber) {
      return res.status(400).json({
        error: "Paramètre barber requis (ex. coiffeur-1)",
      });
    }

    const calendarId = barberCalendars[barber];
    if (!calendarId) {
      const known = Object.keys(barberCalendars);
      return res.status(400).json({
        error:
          known.length === 0
            ? `Aucun coiffeur configuré. Lancez scripts/setup-calendars.js d'abord.`
            : `Coiffeur inconnu ou non configuré : "${barber}". Valeurs attendues : ${known.join(", ")}`,
      });
    }

    const slots = await getAvailableSlots({ date, calendarId, service });
    res.json(slots);
  } catch (err) {
    console.error("[availability]", err);
    res.status(500).json({
      error: "Impossible de récupérer les disponibilités",
      message: err.message,
    });
  }
});

app.post("/api/book", async (req, res) => {
  const result = validateBookingInput(req.body);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  try {
    const booked = await bookSlotOnGoogleCalendar(result.data);
    if (!booked.ok) {
      return res.status(409).json({ ok: false, error: booked.error });
    }

    return res.status(201).json({
      ok: true,
      bookingId: booked.bookingId,
      googleEventId: booked.googleEventId,
      barber: booked.barber,
      date: booked.date,
      time: booked.time,
      service: booked.service,
    });
  } catch (err) {
    console.error("[book]", err);
    return res.status(500).json({
      ok: false,
      error: "Impossible de créer la réservation",
      message: err.message,
    });
  }
});

// Local/dev: start HTTP server. On Vercel, the exported app is used as a serverless handler.
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Backend Riders Barber Shop en écoute sur le port ${PORT}`);
  });
}

module.exports = app;
