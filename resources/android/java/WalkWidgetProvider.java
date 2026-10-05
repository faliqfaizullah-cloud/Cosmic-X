package __APP_ID__;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BlurMaskFilter;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Bundle;
import android.widget.RemoteViews;
import java.util.Random;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 2x2 home-screen widget in the same frosted-glass style as the in-app Walk widget.
 * The whole tile is drawn into one bitmap (28dp corners, glass pane, route, bold-italic text)
 * because RemoteViews cannot blur or draw routes.
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
        Bitmap bmp = draw(wDp, hDp, density * scale, loadState(ctx));

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

    static Bitmap draw(int wDp, int hDp, float d, JSONObject s) {
        int w = Math.max(1, Math.round(wDp * d));
        int h = Math.max(1, Math.round(hDp * d));
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);

        // 28dp rounded corners
        float corner = CORNER_DP * d;
        Path clip = new Path();
        clip.addRoundRect(new RectF(0, 0, w, h), corner, corner, Path.Direction.CW);
        c.clipPath(clip);

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        // 1) backdrop: cool grey-blue fading to salmon, like the in-app Walk screen
        p.setShader(new LinearGradient(0, 0, 0, h, new int[]{0xFFA8AFBF, 0xFFB6B3C0, 0xFFD6A596, 0xFFEC9B80},
                new float[]{0f, 0.34f, 0.66f, 1f}, Shader.TileMode.CLAMP));
        c.drawRect(0, 0, w, h, p);
        p.setShader(null);

        // 2) blurred dark silhouette the glass sits on
        p.setColor(0xFF151B27);
        p.setMaskFilter(new BlurMaskFilter(Math.max(2f, 9f * d), BlurMaskFilter.Blur.NORMAL));
        c.drawRoundRect(new RectF(w * 0.38f, -h * 0.06f, w * 0.60f, h * 0.42f), 12f * d, 12f * d, p);
        c.drawOval(new RectF(w * 0.14f, h * 0.50f, w * 0.88f, h * 1.12f), p);
        p.setMaskFilter(null);

        // 3) frosted glass pane
        float m = 7f * d;
        RectF glass = new RectF(m, m, w - m, h - m);
        float gr = corner - m + 3f * d;
        Path glassPath = new Path();
        glassPath.addRoundRect(glass, gr, gr, Path.Direction.CW);
        p.setStyle(Paint.Style.FILL);
        p.setShader(new LinearGradient(glass.left, glass.top, glass.right, glass.bottom,
                new int[]{0x6DFFFFFF, 0x22FFFFFF, 0x3AFFFFFF}, new float[]{0f, 0.58f, 1f}, Shader.TileMode.CLAMP));
        c.drawPath(glassPath, p);
        p.setShader(null);

        c.save();
        c.clipPath(glassPath);
        // cool rim light, bottom-left (as in the reference)
        p.setShader(new RadialGradient(glass.left + 10f * d, glass.bottom - 8f * d, 52f * d, 0x663CA0E6, 0x003CA0E6, Shader.TileMode.CLAMP));
        c.drawRect(glass, p);
        p.setShader(null);
        // fine frosted grain
        Random rnd = new Random(7);
        int dots = (w * h) / 70;
        for (int i = 0; i < dots; i++) {
            float x = rnd.nextFloat() * w;
            float y = rnd.nextFloat() * h;
            p.setColor(rnd.nextBoolean() ? 0x16FFFFFF : 0x10000000);
            c.drawRect(x, y, x + Math.max(1f, d * 0.7f), y + Math.max(1f, d * 0.7f), p);
        }
        c.restore();

        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(1f, 1.1f * d));
        p.setColor(0x9AFFFFFF);
        c.drawRoundRect(glass, gr, gr, p);
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

        // route outline + glowing yellow location dot
        drawRoute(c, p, s.optJSONArray("route"), pad, 34f * e, w - pad, h * 0.56f, e);

        Typeface tf = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD_ITALIC);
        p.setTypeface(tf);
        p.setStyle(Paint.Style.FILL);

        // row 1: state chip (left) + activity name (right, shrunk/truncated to the space left over)
        String chip = "recording".equals(state) ? "REC" : "paused".equals(state) ? "PAUSED" : "READY";
        p.setTextSize(8.5f * e);
        float cw = p.measureText(chip) + 12f * e;
        RectF chipRect = new RectF(pad, 13f * e, pad + cw, 28f * e);
        p.setColor("recording".equals(state) ? 0xD9D7FF2F : "paused".equals(state) ? 0xD9FFE078 : 0x38FFFFFF);
        c.drawRoundRect(chipRect, 8f * e, 8f * e, p);
        p.setColor("idle".equals(state) ? 0xF2FFFFFF : 0xFF1B2A00);
        c.drawText(chip, pad + 6f * e, chipRect.bottom - 4.2f * e, p);

        float nameRoom = inner - cw - 8f * e;
        p.setTextSize(10f * e);
        while (p.measureText(name) > nameRoom && p.measureText("\u2026") < nameRoom && name.length() > 2) {
            name = fit(name, name.length() - 1);
        }
        p.setTextAlign(Paint.Align.RIGHT);
        p.setColor(0xF2FFFFFF);
        p.setShadowLayer(3f * e, 0, e, 0x2E000000);
        c.drawText(name, w - pad, 25.5f * e, p);
        p.clearShadowLayer();
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
        c.drawText(time, pad, row2, p);
        p.setTextAlign(Paint.Align.RIGHT);
        c.drawText(paceTxt, w - pad, row2, p);
        p.setTextAlign(Paint.Align.LEFT);

        // hero: big distance with the soft white glow from the design; shrinks so "<dist> KM" always fits
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
        p.setColor(0xFFFFFFFF);
        p.setShadowLayer(9f * e, 0, 3f * e, 0xA8FFFFFF);
        c.drawText(dist, pad, base, p);
        p.clearShadowLayer();
        p.setTextSize(kmSize);
        p.setColor(0xB8FFFFFF);
        c.drawText("KM", pad + dw + 5f * e, base, p);
        return bmp;
    }

    private static void drawRoute(Canvas c, Paint p, JSONArray arr, float left, float top, float right, float bottom, float d) {
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
        p.setStrokeWidth(Math.max(1.2f, 1.5f * d));
        p.setColor(demo ? 0x8CFFFFFF : 0xEBFFFFFF);
        p.setShadowLayer(4f * d, 0, 0, 0x80FFFFFF);
        c.drawPath(path, p);
        p.clearShadowLayer();

        p.setStrokeWidth(Math.max(1.2f, 1.4f * d));
        p.setColor(0xD9FFE178);
        c.drawCircle(ex, ey, 7.5f * d, p);
        p.setStyle(Paint.Style.FILL);
        p.setColor(0xFFFFE36B);
        p.setShadowLayer(5f * d, 0, 0, 0xFFFFE36B);
        c.drawCircle(ex, ey, 3.2f * d, p);
        p.clearShadowLayer();
    }
}
