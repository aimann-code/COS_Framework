package com.cos.hrms.onboarding;

import com.cos.hrms.shared.COSError;
import java.awt.image.BufferedImage;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class OnboardingImagePolicy {
  public record Validated(byte[] bytes, String scan) {}

  private final OnboardingDocumentProperties properties;

  public OnboardingImagePolicy(OnboardingDocumentProperties properties) {
    this.properties = properties;
  }

  public Validated validate(MultipartFile file, boolean local) {
    if (file == null || file.isEmpty() || file.getSize() > 5_242_880)
      throw new COSError(
          413, "DOCUMENT_SIZE_INVALID", "Use a JPG or PNG photo no larger than 5 MB.");
    String name = Optional.ofNullable(file.getOriginalFilename()).orElse("");
    String media = Optional.ofNullable(file.getContentType()).orElse("");
    if (name.length() > 200
        || name.contains("/")
        || name.contains("\\")
        || name.contains(":")
        || name.chars().anyMatch(c -> c < 32)
        || !name.toLowerCase(Locale.ROOT).matches(".+\\.(jpg|jpeg|png)")
        || !List.of("image/jpeg", "image/png").contains(media))
      throw new COSError(
          415,
          "DOCUMENT_TYPE_INVALID",
          "Only JPG and PNG photos are supported. PDF, SVG and other files are not accepted.");
    try {
      byte[] raw;
      try (var in = file.getInputStream()) {
        raw = in.readNBytes(5_242_881);
      }
      if (raw.length > 5_242_880)
        throw new COSError(413, "DOCUMENT_SIZE_INVALID", "Use a photo no larger than 5 MB.");
      boolean png =
          raw.length > 8
              && Arrays.equals(
                  Arrays.copyOf(raw, 8), new byte[] {(byte) 137, 80, 78, 71, 13, 10, 26, 10});
      boolean jpg =
          raw.length > 3 && (raw[0] & 255) == 255 && (raw[1] & 255) == 216 && (raw[2] & 255) == 255;
      if (!(png && media.equals("image/png") && name.toLowerCase(Locale.ROOT).endsWith(".png")
          || jpg
              && media.equals("image/jpeg")
              && name.toLowerCase(Locale.ROOT).matches(".+\\.(jpg|jpeg)")))
        throw new COSError(
            415, "DOCUMENT_CONTENT_INVALID", "The photo content does not match its file type.");
      scan(raw, local);
      byte[] sanitized;
      try (var stream = ImageIO.createImageInputStream(new ByteArrayInputStream(raw))) {
        var readers = ImageIO.getImageReaders(stream);
        if (!readers.hasNext()) throw new IOException();
        var reader = readers.next();
        try {
          reader.setInput(stream, true, true);
          int width = reader.getWidth(0), height = reader.getHeight(0);
          if (width < 1
              || height < 1
              || width > 4096
              || height > 4096
              || (long) width * height > 4_194_304)
            throw new COSError(
                422,
                "IMAGE_DIMENSIONS_INVALID",
                "Use a photo up to 4096 pixels per side and 4 megapixels in total.");
          BufferedImage image = reader.read(0);
          if (image == null) throw new IOException();
          try (var out = new ByteArrayOutputStream()) {
            if (!ImageIO.write(image, "png", out)) throw new IOException();
            sanitized = out.toByteArray();
          } finally {
            image.flush();
          }
        } finally {
          reader.dispose();
        }
      }
      if (sanitized.length > 5_242_880)
        throw new COSError(
            413,
            "DOCUMENT_SIZE_INVALID",
            "The processed photo is too large. Upload a smaller image.");
      scan(sanitized, local);
      return new Validated(
          sanitized, properties.getScannerHost().isBlank() ? "VALIDATED_LOCAL" : "SCANNED");
    } catch (COSError e) {
      throw e;
    } catch (IOException e) {
      throw new COSError(
          422, "IMAGE_INVALID", "The image cannot be decoded. Use an intact JPG or PNG photo.");
    }
  }

  private void scan(byte[] bytes, boolean local) {
    if (properties.getScannerHost().isBlank()) {
      if (local) return;
      throw new COSError(
          503,
          "DOCUMENT_SCANNER_REQUIRED",
          "Document uploads are unavailable until malware scanning is configured.");
    }
    try (var socket = new Socket()) {
      socket.connect(
          new InetSocketAddress(properties.getScannerHost(), properties.getScannerPort()), 5000);
      socket.setSoTimeout(10000);
      var out = new DataOutputStream(socket.getOutputStream());
      out.write("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));
      for (int n = 0; n < bytes.length; n += 8192) {
        int size = Math.min(8192, bytes.length - n);
        out.writeInt(size);
        out.write(bytes, n, size);
      }
      out.writeInt(0);
      out.flush();
      var reply = new ByteArrayOutputStream();
      int b;
      while (reply.size() < 1024
          && (b = socket.getInputStream().read()) != -1
          && b != 0
          && b != '\n') reply.write(b);
      String result = reply.toString(StandardCharsets.UTF_8);
      if (result.contains("FOUND"))
        throw new COSError(422, "DOCUMENT_REJECTED", "The scanner rejected this document.");
      if (!result.endsWith(": OK")) throw new IOException();
    } catch (COSError e) {
      throw e;
    } catch (IOException e) {
      throw new COSError(
          503,
          "DOCUMENT_SCANNER_UNAVAILABLE",
          "Document scanning is temporarily unavailable. Please retry later.");
    }
  }
}
