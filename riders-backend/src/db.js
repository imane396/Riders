const { createClient } = require("@supabase/supabase-js");

let supabase;

class UniqueViolationError extends Error {
  constructor(message = "slot_unavailable") {
    super(message);
    this.name = "UniqueViolationError";
    this.code = "23505";
  }
}

function isUniqueViolation(error) {
  if (!error) return false;
  if (error instanceof UniqueViolationError) return true;
  if (error.code === "23505") return true;
  const msg = String(error.message || "");
  return (
    msg.includes("bookings_unique_slot_confirmed") ||
    msg.toLowerCase().includes("duplicate key")
  );
}

/**
 * Initializes the Supabase admin client (server-side only).
 * Requires SUPABASE_URL + SUPABASE_SECRET_KEY.
 */
function initDb() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Missing Supabase credentials: set SUPABASE_URL and SUPABASE_SECRET_KEY in .env"
    );
  }

  supabase = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabase;
}

function getDb() {
  if (!supabase) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return supabase;
}

/**
 * Inserts a confirmed booking row into public.bookings.
 * Throws UniqueViolationError on bookings_unique_slot_confirmed conflicts.
 * @returns {Promise<{ id: number }>}
 */
async function insertBooking({
  googleEventId,
  barber,
  service,
  bookingDate,
  startTime,
  endTime,
  customerName,
  customerPhone,
  customerEmail,
  status = "confirmed",
}) {
  const client = getDb();

  const { data, error } = await client
    .from("bookings")
    .insert({
      google_event_id: googleEventId,
      barber,
      service,
      booking_date: bookingDate,
      start_time: startTime,
      end_time: endTime,
      customer_name: customerName,
      customer_phone: customerPhone ?? null,
      customer_email: customerEmail ?? null,
      status,
    })
    .select("id")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      throw new UniqueViolationError(error.message);
    }
    const err = new Error(error.message || "Supabase insert failed");
    err.code = error.code;
    err.cause = error;
    throw err;
  }

  if (!data || data.id == null) {
    throw new Error("Supabase insert succeeded but returned no booking id");
  }

  return { id: Number(data.id) };
}

module.exports = {
  initDb,
  getDb,
  insertBooking,
  UniqueViolationError,
  isUniqueViolation,
};
