export type SamplerInputSource = "midi" | "stream-deck" | "companion";

export type SamplerTrigger = {
  source: SamplerInputSource;
  control: string;
  cueId: string;
  action: "play" | "stop" | "toggle";
};

export interface SamplerInputAdapter {
  readonly source: SamplerInputSource;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onTrigger(handler: (trigger: SamplerTrigger) => void): () => void;
}

export type SamplerControlBinding = {
  source: SamplerInputSource;
  control: string;
  cueId: string;
};
