package com.avionix.snet.ws;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Slf4j
@RequiredArgsConstructor
public class AvionixWebSocketHandler extends TextWebSocketHandler {

    private final ObjectMapper objectMapper;
    private final Set<WebSocketSession> sessions = ConcurrentHashMap.newKeySet();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
        log.info("[WS] Client connected: {} (total: {})", session.getId(), sessions.size());
        // Send connection confirmation
        send(session, Map.of(
            "type", "CONNECTED",
            "data", Map.of("sessionId", session.getId(), "ts", Instant.now().toString())
        ));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
        log.info("[WS] Client disconnected: {} (total: {})", session.getId(), sessions.size());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // Handle ping/pong keepalive from client
        try {
            Map<?, ?> msg = objectMapper.readValue(message.getPayload(), Map.class);
            if ("PING".equals(msg.get("type"))) {
                send(session, Map.of("type", "PONG", "data", Map.of("ts", Instant.now().toString())));
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        sessions.remove(session);
        log.warn("[WS] Transport error for {}: {}", session.getId(), exception.getMessage());
    }

    /** Broadcast a message to all connected clients */
    public void broadcast(String type, Object data) {
        Map<String, Object> msg = Map.of("type", type, "data", data, "ts", Instant.now().toString());
        sessions.removeIf(s -> !s.isOpen());
        sessions.forEach(s -> send(s, msg));
    }

    /** Heartbeat — keeps connections alive and lets clients detect drops */
    @Scheduled(fixedDelay = 30000)
    public void heartbeat() {
        if (!sessions.isEmpty()) {
            broadcast("HEARTBEAT", Map.of("connectedClients", sessions.size()));
        }
    }

    private void send(WebSocketSession session, Object payload) {
        try {
            if (session.isOpen()) {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(payload)));
            }
        } catch (IOException e) {
            log.warn("[WS] Send failed for {}: {}", session.getId(), e.getMessage());
            sessions.remove(session);
        }
    }
}
