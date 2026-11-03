/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createReader } from "exifreader/core";
import { jpeg } from "exifreader/formats";

const reader = createReader({ formats: [jpeg] });

const fromArrayBuffer = reader.load(new ArrayBuffer(0));
const fromTypedArray = reader.load(new Uint8Array(0));
const fromDataView = reader.load(new DataView(new ArrayBuffer(0)));
const fromBlob = reader.load(new Blob([]));

// @ts-expect-error
reader.load("image.jpg");
// @ts-expect-error
reader.load(42);
// @ts-expect-error
reader.load({ not: "bytes" });

export { reader, fromArrayBuffer, fromTypedArray, fromDataView, fromBlob };
