import 'leaflet';

declare module 'leaflet' {
  namespace Control {
    class Draw extends Control {
      constructor(options?: DrawConstructorOptions);
    }
  }

  interface DrawConstructorOptions {
    position?: ControlPosition;
    draw?: DrawOptions;
    edit?: EditOptions;
  }

  interface DrawOptions {
    polyline?: false | object;
    polygon?: false | object;
    rectangle?: false | object;
    circle?: false | object;
    circlemarker?: false | object;
    marker?: false | object;
  }

  interface EditOptions {
    featureGroup: FeatureGroup;
    remove?: boolean | object;
    edit?: boolean | object;
  }

  namespace Draw {
    const Event: {
      CREATED: string;
      EDITED: string;
      DELETED: string;
      DRAWSTART: string;
      DRAWSTOP: string;
    };
  }
}

declare module 'leaflet-draw';
