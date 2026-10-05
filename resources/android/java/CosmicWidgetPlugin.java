package __APP_ID__;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS -> native bridge: the web app pushes the latest walk state, the home-screen widget redraws. */
@CapacitorPlugin(name = "CosmicWidget")
public class CosmicWidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        try {
            WalkWidgetProvider.saveState(getContext(), call.getData().toString());
            WalkWidgetProvider.refreshAll(getContext());
            call.resolve();
        } catch (Exception e) {
            call.reject("widget update failed: " + e.getMessage());
        }
    }
}
