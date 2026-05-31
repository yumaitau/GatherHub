import Foundation

struct AddressSuggestion: Identifiable, Hashable {
    let id: String
    let text: String
}

enum GoogleAddressLookupError: LocalizedError {
    case missingKey
    case badResponse

    var errorDescription: String? {
        switch self {
        case .missingKey:
            return "Google Maps address lookup is not configured."
        case .badResponse:
            return "Google address lookup failed."
        }
    }
}

actor GoogleAddressLookupService {
    static let shared = GoogleAddressLookupService()

    func suggestions(for input: String) async throws -> [AddressSuggestion] {
        let query = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 3 else { return [] }
        guard !Secrets.googleMapsAPIKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw GoogleAddressLookupError.missingKey
        }

        var request = URLRequest(url: URL(string: "https://places.googleapis.com/v1/places:autocomplete")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Secrets.googleMapsAPIKey, forHTTPHeaderField: "X-Goog-Api-Key")
        request.setValue(
            Bundle.main.bundleIdentifier ?? "au.com.gatherhub",
            forHTTPHeaderField: "X-Ios-Bundle-Identifier"
        )
        request.setValue(
            "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
            forHTTPHeaderField: "X-Goog-FieldMask"
        )
        request.httpBody = try JSONEncoder().encode(AutocompleteRequest(
            input: query,
            languageCode: "en-AU",
            regionCode: "au"
        ))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw GoogleAddressLookupError.badResponse
        }

        let decoded = try JSONDecoder().decode(AutocompleteResponse.self, from: data)
        return decoded.suggestions.compactMap { suggestion in
            guard let prediction = suggestion.placePrediction else { return nil }
            return AddressSuggestion(
                id: prediction.placeId,
                text: prediction.text.text
            )
        }
    }
}

private struct AutocompleteRequest: Encodable {
    let input: String
    let languageCode: String
    let regionCode: String
}

private struct AutocompleteResponse: Decodable {
    let suggestions: [Suggestion]
}

private struct Suggestion: Decodable {
    let placePrediction: PlacePrediction?
}

private struct PlacePrediction: Decodable {
    let placeId: String
    let text: PlacePredictionText
}

private struct PlacePredictionText: Decodable {
    let text: String
}
