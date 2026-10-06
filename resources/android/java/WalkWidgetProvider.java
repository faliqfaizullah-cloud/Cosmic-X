package __APP_ID__;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.os.Bundle;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 2x2 home-screen widget: a solid dark or solid white tile (follows the phone's theme, or the
 * "Widget style" setting inside the app) with 28dp corners, route outline, and bold-italic text.
 * The whole tile is drawn into one bitmap because RemoteViews cannot draw routes.
 */
public class WalkWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "cosmicx_widget";
    static final String KEY = "state";
    static final float CORNER_DP = 28f;

    // outline used before there is a real route (0..1 in a 2.4:1 box)
    private static final float[] DEMO = {0.10f, 0.66f, 0.16f, 0.50f, 0.28f, 0.36f, 0.40f, 0.30f, 0.48f, 0.38f, 0.58f, 0.20f,
            0.80f, 0.30f, 0.72f, 0.52f, 0.58f, 0.58f, 0.44f, 0.70f, 0.26f, 0.74f, 0.12f, 0.68f};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        render(context, manager, id);
    }

    static void saveState(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply();
    }

    static void refreshAll(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, WalkWidgetProvider.class));
        for (int id : ids) render(ctx, manager, id);
    }

    private static JSONObject loadState(Context ctx) {
        try {
            String raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            if (raw != null) return new JSONObject(raw);
        } catch (Exception ignored) {
            // fall through to an empty state
        }
        return new JSONObject();
    }

    /** "dark" / "light" force a style; anything else follows the phone's day/night theme. */
    static boolean isDark(Context ctx, JSONObject s) {
        String theme = s.optString("theme", "auto");
        if ("dark".equals(theme)) return true;
        if ("light".equals(theme)) return false;
        int night = ctx.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return night == Configuration.UI_MODE_NIGHT_YES;
    }

    static void render(Context ctx, AppWidgetManager manager, int id) {
        float density = ctx.getResources().getDisplayMetrics().density;
        Bundle opts = manager.getAppWidgetOptions(id);
        boolean land = ctx.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
        int wDp = opts.getInt(land ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int hDp = opts.getInt(land ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (wDp <= 0) wDp = 160;
        if (hDp <= 0) hDp = 160;
        // keep the bitmap comfortably below the RemoteViews memory limit
        float maxPx = 520f;
        float scale = Math.min(1f, maxPx / (Math.max(wDp, hDp) * density));
        JSONObject state = loadState(ctx);
        Bitmap bmp = draw(wDp, hDp, density * scale, state, isDark(ctx, state));

        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_walk);
        views.setImageViewBitmap(R.id.widget_img, bmp);
        Intent launch = new Intent(ctx, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pi);
        manager.updateAppWidget(id, views);
    }

    private static String fit(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "\u2026";
    }

    static Bitmap draw(int wDp, int hDp, float d, JSONObject s, boolean dark) {
        int w = Math.max(1, Math.round(wDp * d));
        int h = Math.max(1, Math.round(hDp * d));
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);

        // palette: solid dark or solid white
        int bg = dark ? 0xFF121214 : 0xFFFFFFFF;
        int ink = dark ? 0xFFFFFFFF : 0xFF111114;
        int inkDim = dark ? 0xA6FFFFFF : 0xA6111114;
        int hairline = dark ? 0x26FFFFFF : 0x1F000000;
        int chipIdle = dark ? 0x24FFFFFF : 0x14000000;
        int lime = 0xFFD7FF2F;
        int amber = 0xFFFFE078;
        int onAccent = 0xFF1B2A00;
        int ring = dark ? 0xFFFFE36B : 0xFFE5A800;
        int dot = dark ? 0xFFFFE36B : 0xFFF2B600;

        // 28dp rounded corners
        float corner = CORNER_DP * d;
        Path clip = new Path();
        clip.addRoundRect(new RectF(0, 0, w, h), corner, corner, Path.Direction.CW);
        c.clipPath(clip);

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.FILL);
        p.setColor(bg);
        c.drawRect(0, 0, w, h, p);

        // thin edge so a white tile stays visible on a white wallpaper (and a dark one on black)
        float hl = Math.max(1f, d);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(hl);
        p.setColor(hairline);
        c.drawRoundRect(new RectF(hl / 2f, hl / 2f, w - hl / 2f, h - hl / 2f), corner, corner, p);
        p.setStyle(Paint.Style.FILL);

        // ---- content (everything scales with the widget size; text shrinks to fit its slot) ----
        String state = s.optString("state", "idle");
        String name = s.optString("name", "Cosmic X");
        String dist = s.optString("distance", "0.00");
        String time = s.optString("time", "0:00");
        String pace = s.optString("pace", "--:--");
        float e = d * Math.max(0.68f, Math.min(wDp, hDp) / 160f); // "effective dp" for this widget size
        float pad = 17f * d;
        float inner = w - 2f * pad;

        // route outline + location dot
        drawRoute(c, p, s.optJSONArray("route"), pad, 34f * e, w - pad, h * 0.56f, e, ink, ring, dot);

        Typeface tf = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD_ITALIC);
        p.setTypeface(tf);
        p.setStyle(Paint.Style.FILL);

        // row 1: state chip (left) + activity name (right, shrunk/truncated to the space left over)
        String chip = "recording".equals(state) ? "REC" : "paused".equals(state) ? "PAUSED" : "READY";
        p.setTextSize(8.5f * e);
        float cw = p.measureText(chip) + 12f * e;
        RectF chipRect = new RectF(pad, 13f * e, pad + cw, 28f * e);
        p.setColor("recording".equals(state) ? lime : "paused".equals(state) ? amber : chipIdle);
        c.drawRoundRect(chipRect, 8f * e, 8f * e, p);
        p.setColor("idle".equals(state) ? ink : onAccent);
        c.drawText(chip, pad + 6f * e, chipRect.bottom - 4.2f * e, p);

        float nameRoom = inner - cw - 8f * e;
        p.setTextSize(10f * e);
        while (p.measureText(name) > nameRoom && p.measureText("\u2026") < nameRoom && name.length() > 2) {
            name = fit(name, name.length() - 1);
        }
        p.setTextAlign(Paint.Align.RIGHT);
        p.setColor(ink);
        c.drawText(name, w - pad, 25.5f * e, p);
        p.setTextAlign(Paint.Align.LEFT);

        // row 2: time (left) + pace (right); drop the "/Km" suffix, then shrink, if it doesn't fit
        float row2 = h * 0.645f;
        float rowSize = 11.5f * e;
        p.setTextSize(rowSize);
        String paceTxt = pace + " /Km";
        float gap = 8f * e;
        if (p.measureText(time) + gap + p.measureText(paceTxt) > inner) paceTxt = pace;
        float need = p.measureText(time) + gap + p.measureText(paceTxt);
        if (need > inner) {
            rowSize = Math.max(6.5f * e, rowSize * inner / need);
            p.setTextSize(rowSize);
        }
        p.setColor(inkDim);
        c.drawText(time, pad, row2, p);
        p.setTextAlign(Paint.Align.RIGHT);
        c.drawText(paceTxt, w - pad, row2, p);
        p.setTextAlign(Paint.Align.LEFT);

        // hero: big distance; shrinks so "<dist> KM" always fits
        float base = h - 19f * e;
        float kmSize = 10f * e;
        p.setTextSize(kmSize);
        float kmW = p.measureText("KM");
        float heroSize = Math.min(38f * e, h * 0.235f);
        p.setTextSize(heroSize);
        float room = inner - 5f * e - kmW;
        float dw = p.measureText(dist);
        if (dw > room) {
            heroSize = Math.max(11f * e, heroSize * room / dw);
            p.setTextSize(heroSize);
            dw = p.measureText(dist);
        }
        p.setColor(ink);
        c.drawText(dist, pad, base, p);
        p.setTextSize(kmSize);
        p.setColor(inkDim);
        c.drawText("KM", pad + dw + 5f * e, base, p);
        return bmp;
    }

    private static void drawRoute(Canvas c, Paint p, JSONArray arr, float left, float top, float right, float bottom, float d,
                                  int line, int ring, int dot) {
        float[] pts;
        if (arr != null && arr.length() >= 4) {
            pts = new float[arr.length() - (arr.length() % 2)];
            for (int i = 0; i < pts.length; i++) pts[i] = (float) arr.optDouble(i, 0);
        } else {
            pts = DEMO;
        }
        boolean demo = pts == DEMO;
        // fit a 2.4:1 box inside the available area, centred
        float aw = right - left, ah = bottom - top;
        float rw = aw, rh = rw / 2.4f;
        if (rh > ah) { rh = ah; rw = rh * 2.4f; }
        float ox = left + (aw - rw) / 2f, oy = top + (ah - rh) / 2f;

        Path path = new Path();
        float ex = 0, ey = 0;
        for (int i = 0; i + 1 < pts.length; i += 2) {
            float x = ox + pts[i] * rw, y = oy + pts[i + 1] * rh;
            if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
            ex = x; ey = y;
        }
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setStrokeJoin(Paint.Join.ROUND);
        p.setStrokeWidth(Math.max(1.2f, 1.7f * d));
        // the placeholder outline is drawn at ~40% so it reads as "nothing recorded yet"
        p.setColor(demo ? ((line & 0x00FFFFFF) | 0x66000000) : line);
        c.drawPath(path, p);

        p.setStrokeWidth(Math.max(1.2f, 1.5f * d));
        p.setColor(ring);
        c.drawCircle(ex, ey, 7.5f * d, p);
        p.setStyle(Paint.Style.FILL);
        p.setColor(dot);
        c.drawCircle(ex, ey, 3.4f * d, p);
    }
}
