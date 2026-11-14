// Loads a mission's model file (glTF binary). Kept in its own module so the loader is only
// fetched when a model file is shown. Compressed models need the Draco mesh decoder: its two
// files (from three.js, Apache-2.0, Google) are served from /draco/ as plain static files,
// which is the way DRACOLoader is designed to find them and works the same in the dev server
// and in the built site.
import type { Object3D } from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

let draco: DRACOLoader | null = null
function dracoLoader(): DRACOLoader {
  if (!draco) {
    draco = new DRACOLoader()
    draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
  }
  return draco
}

export function loadGlb(url: string): Promise<Object3D> {
  return new Promise((ok, fail) => new GLTFLoader().setDRACOLoader(dracoLoader()).load(url, (g) => ok(g.scene), undefined, fail))
}
