export type Status = 'On Track' | 'At Risk' | 'Delayed' | 'Pending' | 'Delivered' | 'Cancelled';
export type Item = { id: string; name: string; sku: string; quantity: number; weight: number; value: number };
export type Shipment = { id: string; tracking: string; origin: string; destination: string; recipient: string; carrier: string; mode: string; eta: string; status: Status; weight: string; createdAt: number; items: Item[]; events: { title: string; time: string; done: boolean; actor?: string }[] };
