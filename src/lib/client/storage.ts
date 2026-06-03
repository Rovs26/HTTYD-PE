"use client";

export function hostTokenKey(joinCode: string) {
  return `dragon-host-token:${joinCode.toUpperCase()}`;
}

export function playerTokenKey(joinCode: string) {
  return `dragon-player-token:${joinCode.toUpperCase()}`;
}

export function playerNameKey(joinCode: string) {
  return `dragon-player-name:${joinCode.toUpperCase()}`;
}
